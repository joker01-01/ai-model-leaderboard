"""Run deterministic, network-free end-to-end graph evaluations."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import cast

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.domain.errors import ToolErrorCode, ToolName, ToolResult  # noqa: E402
from app.domain.models import (  # noqa: E402
    AgentRequest,
    ExactModelResolution,
    ExactResolutionStatus,
    GetModelBenchmarksInput,
    GetModelPricingInput,
    ListModelsData,
    ListModelsInput,
    ModelBenchmarksData,
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
from app.repositories.leaderboard import LeaderboardRepository  # noqa: E402
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


class EvaluationCase(StrictModel):
    id: str
    message: str
    parsed: ParsedAgentRequest | None = None
    gateway_error: str | None = None
    synthetic_ambiguity_model_ids: tuple[str, ...] = ()
    raising_tool: ToolName | None = None
    expected: ExpectedResult


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


def _repository_for_case(base: LeaderboardRepository, case: EvaluationCase) -> LeaderboardRepository:
    if not case.synthetic_ambiguity_model_ids:
        return base
    return SyntheticAmbiguousRepository(
        base,
        query=case.parsed.model_reference if case.parsed and case.parsed.model_reference else "",
        model_ids=case.synthetic_ambiguity_model_ids,
    )


def _assert_case(
    case: EvaluationCase,
    answer: AgentAnswer,
    state: AgentState,
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
    assert selected_model_id == expected.selected_model_id, (
        case.id,
        selected_model_id,
        expected.selected_model_id,
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
        results.append(_assert_case(case, answer, cast(AgentState, state)))

    return tuple(results)


def main() -> int:
    results = asyncio.run(run_cases())
    for result in results:
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    print(json.dumps({"passed": len(results), "total": len(results)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
