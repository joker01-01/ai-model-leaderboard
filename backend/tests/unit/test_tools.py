from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.domain.errors import ToolErrorCode
from app.domain.models import (
    BenchmarkId,
    BenchmarkObservation,
    Citation,
    CurrencyCode,
    GetModelBenchmarksInput,
    GetModelPricingInput,
    ListModelsInput,
    PrepareDataUpdateInput,
    PriceCalculationStatus,
    PricingTier,
    ProposedBenchmarkObservation,
    ProviderId,
    ProviderSourceKind,
    RegionId,
    SearchProviderDocsInput,
    SourceAttemptStatus,
)
from app.repositories.leaderboard import LeaderboardRepository
from app.tools import (
    ProviderDocumentResponse,
    get_model_benchmarks,
    get_model_pricing,
    list_models,
    prepare_data_update,
    search_provider_docs,
)


@pytest.fixture(scope="module")
def repository() -> LeaderboardRepository:
    return LeaderboardRepository.load()


def _without_benchmark(
    repository: LeaderboardRepository,
    *,
    model_id: str,
    benchmark_id: BenchmarkId,
) -> LeaderboardRepository:
    evidence = repository.evidence.model_copy(
        update={
            "benchmark_observations": tuple(
                observation
                for observation in repository.evidence.benchmark_observations
                if not (
                    observation.model_id == model_id
                    and observation.benchmark_id == benchmark_id
                )
            )
        }
    )
    return LeaderboardRepository(repository.catalog, evidence)


def _with_synthetic_benchmark(
    repository: LeaderboardRepository,
    *,
    model_id: str,
    benchmark_id: BenchmarkId,
) -> LeaderboardRepository:
    without_existing = _without_benchmark(
        repository,
        model_id=model_id,
        benchmark_id=benchmark_id,
    )
    definition = next(
        item
        for item in without_existing.evidence.benchmark_definitions
        if item.id == benchmark_id
    )
    observation = BenchmarkObservation(
        model_id=model_id,
        benchmark_id=benchmark_id,
        value=(definition.calibration.min + definition.calibration.max) / 2,
        model_version=f"synthetic-{model_id}",
        observed_at=date(2026, 9, 1),
        definition=definition,
    )
    evidence = without_existing.evidence.model_copy(
        update={
            "benchmark_observations": (
                *without_existing.evidence.benchmark_observations,
                observation,
            )
        }
    )
    return LeaderboardRepository(without_existing.catalog, evidence)


def _pricing_request(
    *,
    model_id: str = "qwen-3-5",
    region_id: RegionId = RegionId.CN_BEIJING,
    currency: CurrencyCode = CurrencyCode.USD,
    input_tokens: int = 10_000,
    cached_input_tokens: int = 0,
    output_tokens: int = 2_000,
    as_of: date = date(2026, 9, 15),
) -> GetModelPricingInput:
    return GetModelPricingInput(
        model_id=model_id,
        region_id=region_id,
        currency=currency,
        input_tokens=input_tokens,
        cached_input_tokens=cached_input_tokens,
        output_tokens=output_tokens,
        monthly_request_count=1_000,
        as_of=as_of,
    )


def test_list_models_returns_exact_candidates_and_typed_exclusions(
    repository: LeaderboardRepository,
) -> None:
    controlled_repository = _without_benchmark(
        repository,
        model_id="glm-5-3",
        benchmark_id=BenchmarkId.AA_CODING,
    )
    controlled_repository = _with_synthetic_benchmark(
        controlled_repository,
        model_id="qwen-3-5",
        benchmark_id=BenchmarkId.AA_CODING,
    )
    result = list_models(
        ListModelsInput(
            candidate_model_ids=("qwen-3-5", "glm-5-3"),
            provider_region_id=RegionId.CN_BEIJING,
            currency=CurrencyCode.USD,
        ),
        repository=controlled_repository,
    )

    assert result.ok
    assert result.data is not None
    assert [candidate.model_id for candidate in result.data.candidates] == ["qwen-3-5"]
    decisions = {decision.model_id: decision for decision in result.data.filter_decisions}
    assert decisions["qwen-3-5"].included
    assert decisions["qwen-3-5"].reasons == ()
    assert not decisions["glm-5-3"].included
    assert decisions["glm-5-3"].reasons == (
        "missing_evidence:aa-coding",
        "missing_evidence:provider_deployment_offer",
    )


def test_list_models_rejects_unknown_exact_id(repository: LeaderboardRepository) -> None:
    result = list_models(
        ListModelsInput(candidate_model_ids=("qwen-3-5-family",)),
        repository=repository,
    )

    assert not result.ok
    assert result.error is not None
    assert result.error.code == ToolErrorCode.UNKNOWN_MODEL


def test_list_models_bounds_candidate_ids_to_the_error_envelope(
    repository: LeaderboardRepository,
) -> None:
    twenty_unknown_ids = tuple(f"unknown-model-{index}" for index in range(20))
    result = list_models(
        ListModelsInput(candidate_model_ids=twenty_unknown_ids),
        repository=repository,
    )

    assert not result.ok
    assert result.error is not None
    assert result.error.code == ToolErrorCode.UNKNOWN_MODEL
    assert result.error.details["candidateModelIds"] == twenty_unknown_ids

    with pytest.raises(ValidationError, match="at most 20"):
        ListModelsInput(candidate_model_ids=(*twenty_unknown_ids, "unknown-model-20"))


def test_benchmarks_preserve_partial_missing_evidence(repository: LeaderboardRepository) -> None:
    result = get_model_benchmarks(
        GetModelBenchmarksInput(
            model_id="qwen-3-5",
            benchmark_ids=(BenchmarkId.BROWSECOMP, BenchmarkId.AA_CODING),
        ),
        repository=repository,
    )

    assert result.ok
    assert result.data is not None
    assert [observation.benchmark_id for observation in result.data.observations] == [BenchmarkId.AA_CODING]
    assert result.data.missing_benchmark_ids == (BenchmarkId.BROWSECOMP,)
    assert len(result.citations) == 1


def test_pricing_uses_decimal_arithmetic(repository: LeaderboardRepository) -> None:
    result = get_model_pricing(_pricing_request(), repository=repository)

    assert result.ok
    assert result.data is not None
    assert len(result.data.quotes) == 1
    quote = result.data.quotes[0]
    assert quote.status == PriceCalculationStatus.AVAILABLE
    assert quote.per_request_cost == Decimal("0.003784")
    assert quote.monthly_cost == Decimal("3.784000")
    assert isinstance(quote.per_request_cost, Decimal)


@pytest.mark.parametrize(
    ("input_tokens", "expected_price"),
    ((128_000, Decimal("0.172")), (128_001, Decimal("0.43"))),
)
def test_pricing_tier_uses_total_input_and_inclusive_boundary(
    repository: LeaderboardRepository,
    input_tokens: int,
    expected_price: Decimal,
) -> None:
    result = get_model_pricing(
        _pricing_request(input_tokens=input_tokens, output_tokens=0),
        repository=repository,
    )

    assert result.data is not None
    quote = result.data.quotes[0]
    assert quote.tier is not None
    assert quote.tier.input_price == expected_price


def test_pricing_tier_counts_cached_tokens_in_total_input(repository: LeaderboardRepository) -> None:
    result = get_model_pricing(
        _pricing_request(input_tokens=128_000, cached_input_tokens=1, output_tokens=0),
        repository=repository,
    )

    assert not result.ok
    assert result.data is not None
    quote = result.data.quotes[0]
    assert quote.request_input_tokens == 128_001
    assert quote.tier is not None
    assert quote.tier.input_price == Decimal("0.43")
    assert quote.reason == "cached_input_price_missing"
    assert quote.per_request_cost is None


def test_pricing_cutoff_is_inclusive(repository: LeaderboardRepository) -> None:
    at_cutoff = get_model_pricing(
        _pricing_request(as_of=date(2026, 10, 2)),
        repository=repository,
    )
    after_cutoff = get_model_pricing(
        _pricing_request(as_of=date(2026, 10, 3)),
        repository=repository,
    )

    assert at_cutoff.ok
    assert not after_cutoff.ok
    assert after_cutoff.error is not None
    assert after_cutoff.error.code == ToolErrorCode.STALE_EVIDENCE
    assert after_cutoff.data is not None
    assert after_cutoff.data.quotes[0].status == PriceCalculationStatus.STALE_EVIDENCE


def test_missing_region_is_missing_evidence_not_unsupported(repository: LeaderboardRepository) -> None:
    result = get_model_pricing(
        _pricing_request(model_id="deepseek-v4-pro"),
        repository=repository,
    )

    assert not result.ok
    assert result.error is not None
    assert result.error.code == ToolErrorCode.MISSING_EVIDENCE
    assert result.error.details["reason"] == "region_not_observed"
    assert "unsupported" not in result.error.message.casefold()


def _synthetic_tier(*, offer_id: str, provider_id: ProviderId, input_price: str) -> PricingTier:
    return PricingTier(
        offer_id=offer_id,
        model_id="qwen-3-5",
        provider_model_id=f"{provider_id.value}-qwen-3-5",
        provider_id=provider_id,
        region_id=RegionId.US_VIRGINIA,
        currency=CurrencyCode.USD,
        unit="per_1m_tokens",
        billing_mode="realtime",
        min_input_tokens_exclusive=0,
        max_input_tokens_inclusive=256_000,
        input_price=Decimal(input_price),
        cached_input_price=Decimal(input_price),
        output_price=Decimal(input_price),
        observed_at=date(2026, 9, 2),
        stale_after=date(2026, 10, 2),
        valid_through=None,
        source_url=f"https://example.com/{offer_id}",
    )


class _PricingRepository:
    def __init__(self, tiers: tuple[PricingTier, ...]) -> None:
        self._tiers = tiers

    def get_pricing_tiers(self, *_args: object, **_kwargs: object) -> tuple[PricingTier, ...]:
        return self._tiers


def test_pricing_returns_every_matching_offer() -> None:
    repository = _PricingRepository(
        (
            _synthetic_tier(offer_id="z-offer", provider_id=ProviderId.QWEN, input_price="2"),
            _synthetic_tier(
                offer_id="a-offer",
                provider_id=ProviderId.ALIBABA_CLOUD_MODEL_STUDIO,
                input_price="1",
            ),
        )
    )

    result = get_model_pricing(
        _pricing_request(region_id=RegionId.US_VIRGINIA, input_tokens=1, output_tokens=0),
        repository=repository,  # type: ignore[arg-type]
    )

    assert result.ok
    assert result.data is not None
    assert [quote.offer_id for quote in result.data.quotes] == ["a-offer", "z-offer"]


@dataclass
class _FakeDocumentClient:
    responses: dict[str, ProviderDocumentResponse | BaseException]
    calls: list[str] = field(default_factory=list)

    async def get(self, url: str) -> ProviderDocumentResponse:
        self.calls.append(url)
        response = self.responses[url]
        if isinstance(response, BaseException):
            raise response
        return response


def _docs_request() -> SearchProviderDocsInput:
    return SearchProviderDocsInput(
        model_id="qwen-3-5",
        query="Apache license",
        doc_kinds=(ProviderSourceKind.LICENSE,),
    )


def test_provider_docs_uses_injected_client_and_returns_excerpt(repository: LeaderboardRepository) -> None:
    source = repository.get_provider_sources("qwen-3-5", (ProviderSourceKind.LICENSE,))[0]
    client = _FakeDocumentClient(
        {source.url: ProviderDocumentResponse(200, "Official weights use the Apache license for this model.")}
    )

    result = asyncio.run(search_provider_docs(_docs_request(), repository=repository, client=client))

    assert result.ok
    assert result.data is not None
    assert client.calls == [source.url]
    assert result.data.matches[0].url == source.url
    assert "Apache license" in result.data.matches[0].excerpt
    assert result.data.source_attempts[0].status == SourceAttemptStatus.MATCHED


def test_provider_docs_rejects_redirect_outside_allowlist_without_fetching_it(
    repository: LeaderboardRepository,
) -> None:
    source = repository.get_provider_sources("qwen-3-5", (ProviderSourceKind.LICENSE,))[0]
    external_url = "https://attacker.example/provider-doc"
    client = _FakeDocumentClient(
        {source.url: ProviderDocumentResponse(302, redirect_url=external_url)}
    )

    result = asyncio.run(search_provider_docs(_docs_request(), repository=repository, client=client))

    assert not result.ok
    assert result.error is not None
    assert result.error.code == ToolErrorCode.SOURCE_NOT_ALLOWLISTED
    assert client.calls == [source.url]
    assert result.data is not None
    assert result.data.source_attempts[0].status == SourceAttemptStatus.SOURCE_NOT_ALLOWLISTED


def test_provider_docs_rejects_allowlisted_redirect_across_source_metadata(
    repository: LeaderboardRepository,
) -> None:
    sources = repository.get_provider_sources(
        "qwen-3-5",
        (ProviderSourceKind.LICENSE, ProviderSourceKind.PRICING),
    )
    license_source = next(source for source in sources if source.kind == ProviderSourceKind.LICENSE)
    pricing_source = next(source for source in sources if source.kind == ProviderSourceKind.PRICING)
    client = _FakeDocumentClient(
        {
            license_source.url: ProviderDocumentResponse(302, redirect_url=pricing_source.url),
            pricing_source.url: ProviderDocumentResponse(200, "Official Apache license evidence."),
        }
    )
    request = SearchProviderDocsInput(
        model_id="qwen-3-5",
        query="Apache license",
        doc_kinds=(ProviderSourceKind.LICENSE, ProviderSourceKind.PRICING),
    )

    result = asyncio.run(search_provider_docs(request, repository=repository, client=client))

    assert result.ok
    assert result.data is not None
    assert client.calls == [license_source.url, pricing_source.url]
    assert [match.kind for match in result.data.matches] == [ProviderSourceKind.PRICING]
    attempts = {attempt.url: attempt for attempt in result.data.source_attempts}
    assert attempts[license_source.url].status == SourceAttemptStatus.SOURCE_NOT_ALLOWLISTED
    assert attempts[license_source.url].reason == "redirect_target_metadata_mismatch"


def test_provider_docs_allows_redirect_with_the_same_source_metadata(
    repository: LeaderboardRepository,
) -> None:
    sources = tuple(
        sorted(
            repository.get_provider_sources("glm-5-3", (ProviderSourceKind.PRICING,)),
            key=lambda source: source.url,
        )
    )
    assert len(sources) == 2
    initial_source, redirect_source = sources
    client = _FakeDocumentClient(
        {
            initial_source.url: ProviderDocumentResponse(302, redirect_url=redirect_source.url),
            redirect_source.url: ProviderDocumentResponse(200, "Official pricing evidence."),
        }
    )
    request = SearchProviderDocsInput(
        model_id="glm-5-3",
        query="pricing evidence",
        doc_kinds=(ProviderSourceKind.PRICING,),
    )

    result = asyncio.run(search_provider_docs(request, repository=repository, client=client))

    assert result.ok
    assert result.data is not None
    assert client.calls == [initial_source.url, redirect_source.url, redirect_source.url]
    assert [match.url for match in result.data.matches] == [initial_source.url, redirect_source.url]
    assert all(match.kind == ProviderSourceKind.PRICING for match in result.data.matches)


def test_provider_docs_timeout_is_typed_and_retryable(repository: LeaderboardRepository) -> None:
    source = repository.get_provider_sources("qwen-3-5", (ProviderSourceKind.LICENSE,))[0]
    client = _FakeDocumentClient({source.url: TimeoutError("deadline exceeded")})

    result = asyncio.run(search_provider_docs(_docs_request(), repository=repository, client=client))

    assert not result.ok
    assert result.error is not None
    assert result.error.code == ToolErrorCode.UPSTREAM_TIMEOUT
    assert result.error.retryable
    assert result.data is not None
    assert result.data.source_attempts[0].status == SourceAttemptStatus.TIMEOUT


def test_provider_docs_allowlist_entry_without_matching_excerpt_is_not_evidence(
    repository: LeaderboardRepository,
) -> None:
    source = repository.get_provider_sources("qwen-3-5", (ProviderSourceKind.LICENSE,))[0]
    client = _FakeDocumentClient({source.url: ProviderDocumentResponse(200, "Weights download page only.")})

    result = asyncio.run(search_provider_docs(_docs_request(), repository=repository, client=client))

    assert not result.ok
    assert result.error is not None
    assert result.error.code == ToolErrorCode.MISSING_EVIDENCE
    assert result.citations == ()
    assert result.data is not None
    assert result.data.matches == ()
    assert result.data.source_attempts[0].status == SourceAttemptStatus.NO_MATCH


def test_provider_docs_citations_are_unique_for_multiple_sources(
    repository: LeaderboardRepository,
) -> None:
    sources = repository.get_provider_sources("glm-5-3", (ProviderSourceKind.PRICING,))
    client = _FakeDocumentClient(
        {
            source.url: ProviderDocumentResponse(200, "Official pricing evidence for this deployment.")
            for source in sources
        }
    )
    request = SearchProviderDocsInput(
        model_id="glm-5-3",
        query="pricing evidence",
        doc_kinds=(ProviderSourceKind.PRICING,),
    )

    result = asyncio.run(search_provider_docs(request, repository=repository, client=client))

    assert result.ok
    assert len(result.citations) == len(sources) == 2
    assert len({citation.citation_id for citation in result.citations}) == 2


def test_provider_docs_requires_all_query_terms_in_the_returned_excerpt(
    repository: LeaderboardRepository,
) -> None:
    source = repository.get_provider_sources("qwen-3-5", (ProviderSourceKind.LICENSE,))[0]
    client = _FakeDocumentClient(
        {source.url: ProviderDocumentResponse(200, f"Apache {'x' * 1_000} license")}
    )

    result = asyncio.run(search_provider_docs(_docs_request(), repository=repository, client=client))

    assert not result.ok
    assert result.error is not None
    assert result.error.code == ToolErrorCode.MISSING_EVIDENCE
    assert result.citations == ()
    assert result.data is not None
    assert result.data.source_attempts[0].status == SourceAttemptStatus.NO_MATCH


def test_provider_docs_input_forbids_user_supplied_url() -> None:
    with pytest.raises(ValidationError, match="url"):
        SearchProviderDocsInput.model_validate(
            {
                "model_id": "qwen-3-5",
                "query": "Apache license",
                "doc_kinds": (ProviderSourceKind.LICENSE,),
                "url": "https://attacker.example/provider-doc",
            }
        )


def _proposal_request(
    *,
    citation_id: str = "qwen-gpqa-update",
    source_version_id: str | None = None,
) -> PrepareDataUpdateInput:
    exact_version = "qwen/qwen3.5-397b-a17b"
    citation = Citation(
        citation_id="qwen-gpqa-update",
        title="Qwen3.5 technical report",
        url="https://qwenlm.github.io/blog/qwen3.5/",
        observed_at=date(2026, 9, 2),
        excerpt="GPQA Diamond evaluation for the exact Qwen3.5 version.",
        provider_id=ProviderId.QWEN,
        provider_model_id="Qwen3.5-397B-A17B",
        kind=ProviderSourceKind.MODEL_CARD,
    )
    return PrepareDataUpdateInput(
        model_id="qwen-3-5",
        proposed_observations=(
            ProposedBenchmarkObservation(
                benchmark_id=BenchmarkId.GPQA_DIAMOND,
                value=89.4,
                unit="%",
                model_version=exact_version,
                source_version_id=source_version_id or exact_version,
                observed_at=date(2026, 9, 2),
                citation_ids=(citation_id,),
            ),
        ),
        citations=(citation,),
        reason="Refresh the exact-version GPQA observation.",
    )


def test_citation_requires_atomic_provider_binding() -> None:
    with pytest.raises(ValidationError, match="must be supplied together"):
        Citation(
            citation_id="partial-provider-binding",
            title="Incomplete provider citation",
            url="https://example.com/evidence",
            observed_at=date(2026, 9, 2),
            provider_id=ProviderId.QWEN,
            kind=ProviderSourceKind.MODEL_CARD,
        )


def test_prepare_update_input_rejects_non_https_citation_url() -> None:
    payload = _proposal_request().model_dump(mode="json", by_alias=True)
    payload["citations"][0]["url"] = "javascript:alert(1)"

    with pytest.raises(ValidationError, match="absolute HTTPS URL"):
        PrepareDataUpdateInput.model_validate_json(json.dumps(payload))


def _generated_data_digests() -> dict[str, str]:
    generated_dir = Path(__file__).resolve().parents[3] / "data" / "modelops" / "generated"
    return {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(generated_dir.glob("*.json"))
    }


def test_prepare_data_update_is_stable_and_writes_nothing(repository: LeaderboardRepository) -> None:
    before_digests = _generated_data_digests()
    request = _proposal_request()

    first = prepare_data_update(request, repository=repository)
    second = prepare_data_update(request, repository=repository)

    assert first.ok
    assert second.ok
    assert first.data is not None
    assert second.data is not None
    assert first.data == second.data
    assert first.data.proposal_id == second.data.proposal_id
    assert first.data.proposal_id.startswith("proposal-")
    assert first.data.changes[0].before is not None
    assert first.data.changes[0].before.value == 89.3
    assert first.data.changes[0].after.value == 89.4
    assert _generated_data_digests() == before_digests


def test_prepare_data_update_rejects_missing_citation(repository: LeaderboardRepository) -> None:
    result = prepare_data_update(_proposal_request(citation_id="missing-citation"), repository=repository)

    assert not result.ok
    assert result.error is not None
    assert result.error.code == ToolErrorCode.MISSING_EVIDENCE
    assert result.error.details["reason"] == "citation_missing"


def test_prepare_data_update_rejects_mismatched_provider_citation(
    repository: LeaderboardRepository,
) -> None:
    request = _proposal_request()
    citation = request.citations[0].model_copy(
        update={
            "provider_id": ProviderId.OPENAI,
            "provider_model_id": "gpt-5.6-sol",
        }
    )
    request = request.model_copy(update={"citations": (citation,)})

    result = prepare_data_update(request, repository=repository)

    assert not result.ok
    assert result.error is not None
    assert result.error.code == ToolErrorCode.CONFLICTING_EVIDENCE
    assert result.error.details["reason"] == "citation_provider_binding_mismatch"


def test_prepare_data_update_rejects_version_mismatch(repository: LeaderboardRepository) -> None:
    result = prepare_data_update(
        _proposal_request(source_version_id="qwen-family-latest"),
        repository=repository,
    )

    assert not result.ok
    assert result.error is not None
    assert result.error.code == ToolErrorCode.CONFLICTING_EVIDENCE
    assert result.error.details["reason"] == "exact_version_mismatch"


def test_prepare_data_update_rejects_unit_mismatch(repository: LeaderboardRepository) -> None:
    request = _proposal_request()
    observation = request.proposed_observations[0].model_copy(update={"unit": "index"})
    request = request.model_copy(update={"proposed_observations": (observation,)})

    result = prepare_data_update(request, repository=repository)

    assert not result.ok
    assert result.error is not None
    assert result.error.code == ToolErrorCode.CONFLICTING_EVIDENCE
    assert result.error.details["reason"] == "benchmark_unit_mismatch"


def test_prepare_data_update_rejects_value_outside_calibration(
    repository: LeaderboardRepository,
) -> None:
    request = _proposal_request()
    observation = request.proposed_observations[0].model_copy(update={"value": 999.0})
    request = request.model_copy(update={"proposed_observations": (observation,)})

    result = prepare_data_update(request, repository=repository)

    assert not result.ok
    assert result.error is not None
    assert result.error.code == ToolErrorCode.CONFLICTING_EVIDENCE
    assert result.error.details["reason"] == "benchmark_value_out_of_range"


def test_prepare_data_update_rejects_duplicate_benchmark(repository: LeaderboardRepository) -> None:
    request = _proposal_request()
    observation = request.proposed_observations[0]
    request = request.model_copy(update={"proposed_observations": (observation, observation)})

    result = prepare_data_update(request, repository=repository)

    assert not result.ok
    assert result.error is not None
    assert result.error.code == ToolErrorCode.INVALID_ARGUMENTS
    assert result.error.details["reason"] == "duplicate_benchmark_observation"


def test_prepare_data_update_rejects_unapproved_aa_source_version(
    repository: LeaderboardRepository,
) -> None:
    citation = _proposal_request().citations[0]
    request = PrepareDataUpdateInput(
        model_id="qwen-3-5",
        proposed_observations=(
            ProposedBenchmarkObservation(
                benchmark_id=BenchmarkId.AA_CODING,
                value=48.3,
                unit="index",
                model_version="Qwen3.5 397B A17B (Reasoning)",
                source_version_id="qwen-family-latest",
                observed_at=date(2026, 9, 2),
                citation_ids=(citation.citation_id,),
            ),
        ),
        citations=(citation,),
        reason="Refresh the exact-version AA Coding observation.",
    )

    result = prepare_data_update(request, repository=repository)

    assert not result.ok
    assert result.error is not None
    assert result.error.code == ToolErrorCode.CONFLICTING_EVIDENCE
    assert result.error.details["reason"] == "exact_version_mismatch"


class _MultipleBenchmarkAliasRepository:
    def __init__(self, repository: LeaderboardRepository) -> None:
        self._repository = repository

    def require_model(self, model_id: str) -> object:
        return self._repository.require_model(model_id)

    def get_aliases(self, model_id: str):  # type: ignore[no-untyped-def]
        aliases = self._repository.get_aliases(model_id)
        return aliases.model_copy(
            update={
                "benchmark_version_ids": (
                    "qwen/qwen3.5-397b-a17b",
                    "qwen/qwen3.5-397b-a17b-second-approved-id",
                )
            }
        )

    def get_benchmark_definitions(self, benchmark_ids):  # type: ignore[no-untyped-def]
        return self._repository.get_benchmark_definitions(benchmark_ids)

    def get_benchmark_observations(self, model_id, benchmark_ids):  # type: ignore[no-untyped-def]
        return self._repository.get_benchmark_observations(model_id, benchmark_ids)


def test_prepare_data_update_requires_non_aa_source_and_model_version_equality(
    repository: LeaderboardRepository,
) -> None:
    request = _proposal_request(source_version_id="qwen/qwen3.5-397b-a17b-second-approved-id")

    result = prepare_data_update(
        request,
        repository=_MultipleBenchmarkAliasRepository(repository),  # type: ignore[arg-type]
    )

    assert not result.ok
    assert result.error is not None
    assert result.error.code == ToolErrorCode.CONFLICTING_EVIDENCE
    assert result.error.details["reason"] == "exact_version_mismatch"
