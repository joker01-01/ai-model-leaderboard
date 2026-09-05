"""Run deterministic, network-free end-to-end graph evaluations."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Literal, cast

from pydantic import model_validator

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.api.advisor import AdvisorRuntime, _recommend  # noqa: E402
from app.api.advisor_contracts import (  # noqa: E402
    AdvisorBudgetRequest,
    AdvisorOutcome,
    AdvisorRecommendationRequest,
)
from app.domain.advisor import ParsedAdvisorNeed, VerificationStatus  # noqa: E402
from app.domain.errors import ToolErrorCode, ToolName, ToolResult  # noqa: E402
from app.domain.models import (  # noqa: E402
    AgentRequest,
    BenchmarkId,
    ExactModelResolution,
    ExactResolutionStatus,
    GetModelBenchmarksInput,
    GetModelPricingInput,
    ListModelsData,
    ListModelsInput,
    ModelBenchmarksData,
    ModelId,
    ModelPricingData,
    PrepareDataUpdateInput,
    PriceCalculationStatus,
    ProposalStatus,
    ProviderId,
    RunStatus,
    SearchProviderDocsData,
    SearchProviderDocsInput,
    StrictModel,
    UpdateProposal,
)
from app.graph.builder import build_graph  # noqa: E402
from app.graph.state import AgentAnswer, AgentState, GraphContext, initial_state  # noqa: E402
from app.graph.tool_executor import ModelOpsToolExecutor  # noqa: E402
from app.repositories.aa_snapshot import AaSnapshotRepository  # noqa: E402
from app.repositories.leaderboard import LeaderboardRepository  # noqa: E402
from app.repositories.official_sources import OfficialSourcesRepository  # noqa: E402
from app.services.advisor_gateway import AdvisorGatewayError, FakeAdvisorGateway  # noqa: E402
from app.services.advisor_rate_limit import (  # noqa: E402
    ConcurrencyLease,
    NonBlockingConcurrencyGate,
    SlidingWindowRateLimiter,
)
from app.services.evidence_verifier import EvidenceVerifier  # noqa: E402
from app.services.model_gateway import (  # noqa: E402
    FakeModelGateway,
    ModelGatewayError,
    ParsedAgentRequest,
)
from app.tools import ProviderDocumentResponse  # noqa: E402


class ExpectedResult(StrictModel):
    status: RunStatus
    selected_model_id: str | None
    selected_model_rule: Literal["highest_aa_coding"] | None = None
    message_contains: tuple[str, ...]
    gap_codes: tuple[str, ...]
    missing_constraints: tuple[str, ...]
    resolution_status: ExactResolutionStatus | None = None
    proposal_status: ProposalStatus | None = None
    offer_id: str | None = None
    quote_status: PriceCalculationStatus | None = None
    tier_min_input_tokens_exclusive: int | None = None
    tool_error_codes: tuple[ToolErrorCode, ...] | None = None
    tool_error_count: int | None = None
    minimum_exclusion_count: int = 0
    excluded_model_ids_contain: tuple[str, ...] = ()
    rationale_contains: tuple[str, ...] = ()
    state_evidence_model_id: str | None = None
    minimum_state_benchmark_count: int = 0
    minimum_state_pricing_count: int = 0

    @model_validator(mode="after")
    def validate_selected_model_expectation(self) -> ExpectedResult:
        if self.selected_model_id is not None and self.selected_model_rule is not None:
            raise ValueError("selectedModelId and selectedModelRule are mutually exclusive")
        return self


class SyntheticMissingBenchmark(StrictModel):
    model_id: ModelId
    benchmark_id: BenchmarkId


class EvaluationCase(StrictModel):
    id: str
    message: str
    parsed: ParsedAgentRequest | None = None
    gateway_error: str | None = None
    synthetic_ambiguity_model_ids: tuple[str, ...] = ()
    synthetic_missing_benchmarks: tuple[SyntheticMissingBenchmark, ...] = ()
    raising_tool: ToolName | None = None
    expected: ExpectedResult


class AdvisorExpectedResult(StrictModel):
    outcome: AdvisorOutcome
    verification_status: VerificationStatus
    parsed_need: ParsedAdvisorNeed
    candidate_count: int
    verification_call_count: int


class AdvisorEvaluationCase(StrictModel):
    id: str
    requirement: str
    parsed: ParsedAdvisorNeed | None
    failure: Literal["none", "parse", "verify", "capacity"]
    deployment_region: str | None
    budget: AdvisorBudgetRequest | None
    expected: AdvisorExpectedResult


class OfflineDocumentClient:
    async def get(self, _url: str) -> ProviderDocumentResponse:
        return ProviderDocumentResponse(status_code=404)


class RaisingListModelsExecutor(ModelOpsToolExecutor):
    async def list_models(self, _request: ListModelsInput) -> ToolResult[ListModelsData]:
        raise RuntimeError("synthetic tool failure")


class RaisingBenchmarksExecutor(ModelOpsToolExecutor):
    async def get_model_benchmarks(
        self,
        _request: GetModelBenchmarksInput,
    ) -> ToolResult[ModelBenchmarksData]:
        raise RuntimeError("synthetic tool failure")


class RaisingPricingExecutor(ModelOpsToolExecutor):
    async def get_model_pricing(
        self,
        _request: GetModelPricingInput,
    ) -> ToolResult[ModelPricingData]:
        raise RuntimeError("synthetic tool failure")


class RaisingProviderDocsExecutor(ModelOpsToolExecutor):
    async def search_provider_docs(
        self,
        _request: SearchProviderDocsInput,
    ) -> ToolResult[SearchProviderDocsData]:
        raise RuntimeError("synthetic tool failure")


class RaisingPrepareUpdateExecutor(ModelOpsToolExecutor):
    async def prepare_data_update(
        self,
        _request: PrepareDataUpdateInput,
    ) -> ToolResult[UpdateProposal]:
        raise RuntimeError("synthetic tool failure")


class SyntheticAmbiguousRepository(LeaderboardRepository):
    def __init__(
        self,
        delegate: LeaderboardRepository,
        query: str,
        model_ids: tuple[str, ...],
    ) -> None:
        super().__init__(delegate.catalog, delegate.evidence)
        self._synthetic_query = query
        self._synthetic_model_ids = tuple(sorted(model_ids))

    def resolve_exact_reference(
        self,
        query: str,
        provider_id: ProviderId | None = None,
    ) -> ExactModelResolution:
        if query == self._synthetic_query:
            return ExactModelResolution(
                query=query,
                status=ExactResolutionStatus.AMBIGUOUS,
                model_ids=self._synthetic_model_ids,
            )
        return super().resolve_exact_reference(query, provider_id=provider_id)


def load_cases(path: Path | None = None) -> tuple[EvaluationCase, ...]:
    resolved = path or Path(__file__).with_name("cases.jsonl")
    cases = tuple(
        EvaluationCase.model_validate_json(line)
        for line in resolved.read_text(encoding="utf-8").splitlines()
        if line.strip()
    )
    ids = [case.id for case in cases]
    if len(ids) != len(set(ids)):
        raise ValueError("evaluation case IDs must be unique")
    if len(cases) < 10:
        raise ValueError("at least 10 deterministic evaluation cases are required")
    return cases


def load_advisor_cases(path: Path | None = None) -> tuple[AdvisorEvaluationCase, ...]:
    resolved = path or Path(__file__).with_name("advisor_cases.jsonl")
    cases = tuple(
        AdvisorEvaluationCase.model_validate_json(line)
        for line in resolved.read_text(encoding="utf-8").splitlines()
        if line.strip()
    )
    ids = [case.id for case in cases]
    if len(ids) != len(set(ids)):
        raise ValueError("advisor evaluation case IDs must be unique")
    if len(cases) < 5:
        raise ValueError("at least 5 deterministic advisor evaluation cases are required")
    return cases


def _repository_for_case(base: LeaderboardRepository, case: EvaluationCase) -> LeaderboardRepository:
    repository = base
    if case.synthetic_missing_benchmarks:
        for missing in case.synthetic_missing_benchmarks:
            if base.get_model(missing.model_id) is None:
                raise ValueError(f"{case.id}: unknown synthetic model ID {missing.model_id}")
        missing_pairs = {
            (missing.model_id, missing.benchmark_id)
            for missing in case.synthetic_missing_benchmarks
        }
        evidence = base.evidence.model_copy(
            update={
                "benchmark_observations": tuple(
                    observation
                    for observation in base.evidence.benchmark_observations
                    if (observation.model_id, observation.benchmark_id) not in missing_pairs
                )
            }
        )
        repository = LeaderboardRepository(base.catalog, evidence)

    if not case.synthetic_ambiguity_model_ids:
        return repository
    return SyntheticAmbiguousRepository(
        repository,
        query=case.parsed.model_reference if case.parsed and case.parsed.model_reference else "",
        model_ids=case.synthetic_ambiguity_model_ids,
    )


def _assert_case(
    case: EvaluationCase,
    answer: AgentAnswer,
    state: AgentState,
    repository: LeaderboardRepository,
) -> dict[str, object]:
    expected = case.expected
    assert answer.status == expected.status, (case.id, answer.status, expected.status)
    assert answer.missing_constraints == expected.missing_constraints, (
        case.id,
        answer.missing_constraints,
        expected.missing_constraints,
    )
    for fragment in expected.message_contains:
        assert fragment in answer.message, (case.id, fragment, answer.message)

    selected_model_id = answer.recommendation.selected_model_id if answer.recommendation else None
    expected_selected_model_id = _expected_selected_model_id(expected, repository)
    assert selected_model_id == expected_selected_model_id, (
        case.id,
        selected_model_id,
        expected_selected_model_id,
    )
    rationale = answer.recommendation.rationale if answer.recommendation else ()
    for fragment in expected.rationale_contains:
        assert any(fragment in item for item in rationale), (case.id, fragment, rationale)
    evidence = answer.recommendation.evidence if answer.recommendation else ()
    gap_codes = EvidenceVerifier.gap_codes(evidence)
    assert gap_codes == expected.gap_codes, (case.id, gap_codes, expected.gap_codes)
    exclusions = answer.recommendation.exclusions if answer.recommendation else ()
    assert len(exclusions) >= expected.minimum_exclusion_count, (case.id, exclusions)
    excluded_model_ids = {exclusion.model_id for exclusion in exclusions}
    assert set(expected.excluded_model_ids_contain).issubset(excluded_model_ids), (
        case.id,
        excluded_model_ids,
        expected.excluded_model_ids_contain,
    )

    resolution_status = answer.resolution.status if answer.resolution else None
    assert resolution_status == expected.resolution_status, (
        case.id,
        resolution_status,
        expected.resolution_status,
    )
    proposal_status = answer.update_proposal.status if answer.update_proposal else None
    assert proposal_status == expected.proposal_status, (
        case.id,
        proposal_status,
        expected.proposal_status,
    )
    if expected.tool_error_codes is not None:
        tool_error_codes = tuple(sorted((error.code for error in answer.tool_errors), key=lambda code: code.value))
        assert tool_error_codes == expected.tool_error_codes, (
            case.id,
            tool_error_codes,
            expected.tool_error_codes,
        )
    if expected.tool_error_count is not None:
        assert len(answer.tool_errors) == expected.tool_error_count, (
            case.id,
            len(answer.tool_errors),
            expected.tool_error_count,
        )

    quote = next((quote for item in evidence for quote in item.pricing), None)
    if expected.offer_id is not None:
        assert quote is not None and quote.offer_id == expected.offer_id, (case.id, quote)
    if expected.quote_status is not None:
        assert quote is not None and quote.status == expected.quote_status, (case.id, quote)
    if expected.tier_min_input_tokens_exclusive is not None:
        assert quote is not None and quote.tier is not None, (case.id, quote)
        assert quote.tier.min_input_tokens_exclusive == expected.tier_min_input_tokens_exclusive, (
            case.id,
            quote.tier.min_input_tokens_exclusive,
            expected.tier_min_input_tokens_exclusive,
        )

    state_evidence = state.get("evidence", {})
    if expected.state_evidence_model_id is not None:
        partial = state_evidence.get(expected.state_evidence_model_id)
        assert partial is not None, (case.id, state_evidence)
        assert len(partial.benchmarks) >= expected.minimum_state_benchmark_count, (
            case.id,
            partial.benchmarks,
        )
        assert len(partial.pricing) >= expected.minimum_state_pricing_count, (
            case.id,
            partial.pricing,
        )

    return {
        "id": case.id,
        "status": answer.status.value,
        "selectedModelId": selected_model_id,
        "gapCodes": list(gap_codes),
        "stateEvidenceModelIds": sorted(state_evidence),
    }


def _expected_selected_model_id(
    expected: ExpectedResult,
    repository: LeaderboardRepository,
) -> str | None:
    if expected.selected_model_rule is None:
        return expected.selected_model_id

    candidates: list[tuple[float, float | None, str]] = []
    for model_id in repository.model_ids:
        observations = {
            observation.benchmark_id: observation.value
            for observation in repository.get_benchmark_observations(
                model_id,
                (BenchmarkId.AA_CODING, BenchmarkId.AA_INTELLIGENCE),
            )
        }
        coding = observations.get(BenchmarkId.AA_CODING)
        if coding is None:
            continue
        candidates.append((coding, observations.get(BenchmarkId.AA_INTELLIGENCE), model_id))

    if not candidates:
        return None
    return min(
        candidates,
        key=lambda item: (
            -item[0],
            item[1] is None,
            -(item[1] or 0.0),
            item[2],
        ),
    )[2]


async def run_cases(cases: tuple[EvaluationCase, ...] | None = None) -> tuple[dict[str, object], ...]:
    selected_cases = cases or load_cases()
    base_repository = LeaderboardRepository.load()
    graph = build_graph()
    results: list[dict[str, object]] = []

    for index, case in enumerate(selected_cases, start=1):
        repository = _repository_for_case(base_repository, case)
        response = (
            ModelGatewayError(case.gateway_error)
            if case.gateway_error is not None
            else case.parsed
        )
        if response is None:
            raise ValueError(f"{case.id}: parsed or gatewayError is required")
        gateway = FakeModelGateway({case.message: response})
        executor_types: dict[ToolName | None, type[ModelOpsToolExecutor]] = {
            None: ModelOpsToolExecutor,
            ToolName.LIST_MODELS: RaisingListModelsExecutor,
            ToolName.GET_MODEL_BENCHMARKS: RaisingBenchmarksExecutor,
            ToolName.GET_MODEL_PRICING: RaisingPricingExecutor,
            ToolName.SEARCH_PROVIDER_DOCS: RaisingProviderDocsExecutor,
            ToolName.PREPARE_DATA_UPDATE: RaisingPrepareUpdateExecutor,
        }
        if case.raising_tool not in executor_types:
            raise ValueError(f"{case.id}: unsupported raisingTool {case.raising_tool}")
        executor_type = executor_types[case.raising_tool]
        tools = executor_type(repository, OfflineDocumentClient())
        state = await graph.ainvoke(
            initial_state(
                AgentRequest(message=case.message),
                run_id=f"eval-{index:03d}",
                trace_id=f"eval-trace-{index:03d}",
            ),
            context=GraphContext(
                repository=repository,
                gateway=gateway,
                tools=tools,
                verifier=EvidenceVerifier(),
            ),
            config={"recursion_limit": 32},
        )
        answer = state.get("answer")
        if not isinstance(answer, AgentAnswer):
            raise AssertionError(f"{case.id}: graph did not return an AgentAnswer")
        results.append(_assert_case(case, answer, cast(AgentState, state), repository))

    return tuple(results)


async def run_advisor_cases(
    cases: tuple[AdvisorEvaluationCase, ...] | None = None,
) -> tuple[dict[str, object], ...]:
    selected_cases = cases or load_advisor_cases()
    snapshot_repository = AaSnapshotRepository.load()
    official_sources = OfficialSourcesRepository.load()
    results: list[dict[str, object]] = []

    for case in selected_cases:
        parse_result: ParsedAdvisorNeed | AdvisorGatewayError
        if case.failure == "parse":
            parse_result = AdvisorGatewayError("synthetic advisor parse failure")
        elif case.parsed is None:
            raise ValueError(f"{case.id}: parsed is required unless failure is parse")
        else:
            parse_result = case.parsed
        verification: tuple[()] | AdvisorGatewayError = (
            AdvisorGatewayError("synthetic advisor verification failure")
            if case.failure == "verify"
            else ()
        )
        gateway = FakeAdvisorGateway(
            parsed_needs={case.requirement: parse_result},
            verification=verification,
        )
        gate = NonBlockingConcurrencyGate(capacity=2)
        leases: tuple[ConcurrencyLease, ...] = ()
        if case.failure == "capacity":
            acquired = (await gate.try_acquire(), await gate.try_acquire())
            if any(lease is None for lease in acquired):  # pragma: no cover - gate is locally constructed
                raise AssertionError(f"{case.id}: failed to saturate the advisor web gate")
            leases = tuple(lease for lease in acquired if lease is not None)
        runtime = AdvisorRuntime(
            snapshot_repository=snapshot_repository,
            official_sources=official_sources,
            gateway=gateway,
            rate_limiter=SlidingWindowRateLimiter(limit=5, window_seconds=600),
            web_gate=gate,
        )
        try:
            response = await _recommend(
                AdvisorRecommendationRequest(
                    requirement=case.requirement,
                    deployment_region=case.deployment_region,
                    budget=case.budget,
                ),
                runtime,
            )
        finally:
            for lease in leases:
                await lease.release()

        candidates = (() if response.recommendation is None else (response.recommendation,)) + response.alternatives
        expected = case.expected
        assert response.outcome == expected.outcome, (case.id, response.outcome, expected.outcome)
        assert response.verification_status == expected.verification_status, (
            case.id,
            response.verification_status,
            expected.verification_status,
        )
        assert response.parsed_need.model_dump() == expected.parsed_need.model_dump(), (
            case.id,
            response.parsed_need,
            expected.parsed_need,
        )
        assert len(candidates) == expected.candidate_count, (case.id, len(candidates), expected.candidate_count)
        assert len(gateway.verification_calls) == expected.verification_call_count, (
            case.id,
            len(gateway.verification_calls),
            expected.verification_call_count,
        )
        source_ids = tuple(candidate.source_id for candidate in candidates)
        assert len(source_ids) == len(set(source_ids)), (case.id, source_ids)
        assert response.citations == (), (case.id, response.citations)
        if case.budget is not None:
            maximum = case.budget.to_domain().monthly_budget_usd
            assert all(
                candidate.estimated_monthly_cost_usd is not None
                and float(candidate.estimated_monthly_cost_usd) <= float(maximum)
                for candidate in candidates
            ), (case.id, candidates)
        results.append(
            {
                "id": case.id,
                "suite": "advisor",
                "outcome": response.outcome.value,
                "verificationStatus": response.verification_status.value,
                "candidateCount": len(candidates),
            }
        )

    return tuple(results)


def main() -> int:
    results = asyncio.run(run_cases())
    advisor_results = asyncio.run(run_advisor_cases())
    all_results = (*results, *advisor_results)
    for result in all_results:
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    print(json.dumps({"passed": len(all_results), "total": len(all_results)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
