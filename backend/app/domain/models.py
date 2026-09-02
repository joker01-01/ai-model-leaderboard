"""Strict immutable contracts for generated evidence and ModelOps tools."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator


def _to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class StrictModel(BaseModel):
    """Reject unknown/coerced input and keep validated objects immutable."""

    model_config = ConfigDict(
        alias_generator=_to_camel,
        extra="forbid",
        frozen=True,
        strict=True,
        validate_by_alias=True,
        validate_by_name=True,
    )


def _validate_clean_text(value: str) -> str:
    if value.strip() != value:
        raise ValueError("surrounding whitespace is not allowed")
    return value


def _validate_absolute_https_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as exc:
        raise ValueError("URL must be a valid absolute HTTPS URL") from exc
    if parsed.scheme != "https" or parsed.hostname is None:
        raise ValueError("URL must be a valid absolute HTTPS URL")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("URL credentials are not allowed")
    if port is not None:
        raise ValueError("explicit URL ports are not allowed")
    return value


NonEmptyString = Annotated[str, StringConstraints(min_length=1), AfterValidator(_validate_clean_text)]
AbsoluteHttpsUrl = Annotated[
    str,
    StringConstraints(min_length=1),
    AfterValidator(_validate_clean_text),
    AfterValidator(_validate_absolute_https_url),
]
StableId = Annotated[
    str,
    StringConstraints(max_length=128, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"),
]
ModelId = StableId
CitationId = Annotated[
    str,
    StringConstraints(min_length=1, max_length=128),
    AfterValidator(_validate_clean_text),
]
NonNegativeInt = Annotated[int, Field(ge=0)]
PositiveInt = Annotated[int, Field(gt=0)]
NonNegativeFloat = Annotated[float, Field(ge=0, allow_inf_nan=False)]
FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]
NonNegativeDecimal = Annotated[Decimal, Field(ge=Decimal("0"), allow_inf_nan=False)]


class ProviderId(StrEnum):
    ALIBABA_CLOUD_MODEL_STUDIO = "alibaba-cloud-model-studio"
    ANTHROPIC = "anthropic"
    DEEPSEEK = "deepseek"
    OPENAI = "openai"
    QWEN = "qwen"


class RegionId(StrEnum):
    CN_BEIJING = "cn-beijing"
    DE_FRANKFURT = "de-frankfurt"
    SG = "sg"
    US_VIRGINIA = "us-virginia"


class CurrencyCode(StrEnum):
    CNY = "CNY"
    USD = "USD"


class BenchmarkId(StrEnum):
    AA_CODING = "aa-coding"
    AA_INTELLIGENCE = "aa-intelligence"
    BROWSECOMP = "browsecomp"
    GPQA_DIAMOND = "gpqa-diamond"
    SWE_BENCH_PRO = "swe-bench-pro"
    TAU2_BENCH = "tau2-bench"


class BenchmarkDimension(StrEnum):
    INTELLIGENCE = "intelligence"
    CODING = "coding"
    REASONING = "reasoning"
    AGENT = "agent"


class ArenaDimension(StrEnum):
    TEXT = "text"
    WEBDEV = "webdev"
    AGENT = "agent"


class ProviderSourceKind(StrEnum):
    MODEL_CARD = "model_card"
    PRICING = "pricing"
    AVAILABILITY = "availability"
    LICENSE = "license"
    API_DOCS = "api_docs"


class CatalogSource(StrictModel):
    label: NonEmptyString
    url: NonEmptyString


class ProviderModelBinding(StrictModel):
    provider_id: ProviderId
    provider_model_id: NonEmptyString


class ModelAliases(StrictModel):
    aa_slugs: tuple[NonEmptyString, ...]
    arena_names: tuple[NonEmptyString, ...]
    benchmark_version_ids: tuple[NonEmptyString, ...]
    provider_models: tuple[ProviderModelBinding, ...]


class CatalogModel(StrictModel):
    id: ModelId
    name: NonEmptyString
    maker: NonEmptyString
    maker_en: NonEmptyString
    country: NonEmptyString
    flag: NonEmptyString
    release: NonEmptyString
    ctx: NonEmptyString | None
    price_tier: Literal["极高", "高", "中", "低", "自部署"]
    price_note: NonEmptyString
    open: bool
    license: NonEmptyString
    badges: tuple[NonEmptyString, ...]
    blurb: NonEmptyString
    strengths: tuple[NonEmptyString, ...]
    weaknesses: tuple[NonEmptyString, ...]
    sources: tuple[CatalogSource, ...]
    aliases: ModelAliases


class CatalogSnapshot(StrictModel):
    schema_version: Literal[1]
    data_date: date
    models: tuple[CatalogModel, ...]


class BenchmarkCalibration(StrictModel):
    min: FiniteFloat
    max: FiniteFloat

    @model_validator(mode="after")
    def validate_bounds(self) -> BenchmarkCalibration:
        if self.min >= self.max:
            raise ValueError("calibration min must be less than max")
        return self


class BenchmarkDefinition(StrictModel):
    id: BenchmarkId
    dim: BenchmarkDimension
    label: NonEmptyString
    short_label: NonEmptyString
    unit: Literal["%", "index"]
    source_label: NonEmptyString
    source_url: NonEmptyString
    source_tier: Literal["聚合榜"]
    calibration: BenchmarkCalibration


class BenchmarkObservation(StrictModel):
    model_id: ModelId
    benchmark_id: BenchmarkId
    value: FiniteFloat
    model_version: NonEmptyString
    observed_at: date
    definition: BenchmarkDefinition


class ArenaObservation(StrictModel):
    model_id: ModelId
    dimension: ArenaDimension
    value: FiniteFloat
    rank: FiniteFloat | None
    lower: FiniteFloat | None
    upper: FiniteFloat | None
    observations: NonNegativeInt | None
    category: NonEmptyString
    observed_at: date
    model_version: NonEmptyString


class ArenaSnapshot(StrictModel):
    generated_at: datetime | None
    source_url: NonEmptyString
    observations: tuple[ArenaObservation, ...]


class PricingTier(StrictModel):
    offer_id: StableId
    model_id: ModelId
    provider_model_id: NonEmptyString
    provider_id: ProviderId
    region_id: RegionId
    currency: CurrencyCode
    unit: Literal["per_1m_tokens"]
    billing_mode: Literal["realtime"]
    min_input_tokens_exclusive: NonNegativeInt
    max_input_tokens_inclusive: PositiveInt | None
    input_price: NonNegativeDecimal
    cached_input_price: NonNegativeDecimal | None
    output_price: NonNegativeDecimal
    observed_at: date
    stale_after: date
    valid_through: date | None
    source_url: NonEmptyString

    @model_validator(mode="after")
    def validate_range(self) -> PricingTier:
        maximum = self.max_input_tokens_inclusive
        if maximum is not None and self.min_input_tokens_exclusive >= maximum:
            raise ValueError("maxInputTokensInclusive must be greater than minInputTokensExclusive")
        return self


class ProviderSource(StrictModel):
    model_id: ModelId
    provider_model_id: NonEmptyString
    provider_id: ProviderId
    kind: ProviderSourceKind
    title: NonEmptyString
    url: NonEmptyString
    observed_at: date


class EvidenceSnapshot(StrictModel):
    schema_version: Literal[1]
    benchmark_date: date
    benchmark_definitions: tuple[BenchmarkDefinition, ...]
    benchmark_observations: tuple[BenchmarkObservation, ...]
    arena: ArenaSnapshot
    pricing: tuple[PricingTier, ...]
    provider_sources: tuple[ProviderSource, ...]


class Citation(StrictModel):
    citation_id: CitationId
    title: NonEmptyString
    url: AbsoluteHttpsUrl
    observed_at: date
    excerpt: NonEmptyString | None = None
    provider_id: ProviderId | None = None
    provider_model_id: NonEmptyString | None = None
    kind: ProviderSourceKind | None = None

    @model_validator(mode="after")
    def validate_provider_binding(self) -> Citation:
        provider_fields = (
            self.provider_id is not None,
            self.provider_model_id is not None,
            self.kind is not None,
        )
        if any(provider_fields) and not all(provider_fields):
            raise ValueError("providerId, providerModelId, and kind must be supplied together")
        return self


class ModelTask(StrEnum):
    PYTHON_CODING = "python_coding"


class LicensePolicy(StrEnum):
    ANY = "any"
    OFFICIAL_LICENSE_EVIDENCE = "official_license_evidence"


class ListModelsInput(StrictModel):
    task: ModelTask = ModelTask.PYTHON_CODING
    candidate_model_ids: Annotated[tuple[ModelId, ...], Field(max_length=20)] | None = None
    provider_region_id: RegionId | None = None
    currency: CurrencyCode | None = None
    open_weights_required: bool = False
    license_policy: LicensePolicy = LicensePolicy.ANY

    @field_validator("candidate_model_ids")
    @classmethod
    def validate_unique_candidates(cls, value: tuple[ModelId, ...] | None) -> tuple[ModelId, ...] | None:
        if value is not None and len(value) != len(set(value)):
            raise ValueError("candidateModelIds must not contain duplicates")
        return value


class ModelCandidate(StrictModel):
    model_id: ModelId
    name: NonEmptyString
    maker: NonEmptyString
    open: bool
    license: NonEmptyString


class CandidateDecision(StrictModel):
    model_id: ModelId
    included: bool
    reasons: tuple[NonEmptyString, ...]


class ListModelsData(StrictModel):
    candidates: tuple[ModelCandidate, ...]
    filter_decisions: tuple[CandidateDecision, ...]


class GetModelBenchmarksInput(StrictModel):
    model_id: ModelId
    benchmark_ids: tuple[BenchmarkId, ...]

    @field_validator("benchmark_ids")
    @classmethod
    def validate_benchmark_ids(cls, value: tuple[BenchmarkId, ...]) -> tuple[BenchmarkId, ...]:
        if not value:
            raise ValueError("benchmarkIds must not be empty")
        if len(value) != len(set(value)):
            raise ValueError("benchmarkIds must not contain duplicates")
        return value


class ModelBenchmarksData(StrictModel):
    model_id: ModelId
    observations: tuple[BenchmarkObservation, ...]
    missing_benchmark_ids: tuple[BenchmarkId, ...]


class GetModelPricingInput(StrictModel):
    model_id: ModelId
    region_id: RegionId
    currency: CurrencyCode
    provider_id: ProviderId | None = None
    input_tokens: NonNegativeInt
    cached_input_tokens: NonNegativeInt
    output_tokens: NonNegativeInt
    monthly_request_count: PositiveInt
    as_of: date

    @model_validator(mode="after")
    def validate_total_input(self) -> GetModelPricingInput:
        if self.input_tokens + self.cached_input_tokens <= 0:
            raise ValueError("inputTokens plus cachedInputTokens must be positive")
        return self


class PriceCalculationStatus(StrEnum):
    AVAILABLE = "available"
    MISSING_EVIDENCE = "missing_evidence"
    STALE_EVIDENCE = "stale_evidence"


class PricingQuote(StrictModel):
    offer_id: StableId
    provider_id: ProviderId
    provider_model_id: NonEmptyString
    region_id: RegionId
    currency: CurrencyCode
    tier: PricingTier | None
    request_input_tokens: PositiveInt
    per_request_cost: NonNegativeDecimal | None
    monthly_cost: NonNegativeDecimal | None
    evidence_cutoff: date | None
    status: PriceCalculationStatus
    reason: NonEmptyString | None = None


class ModelPricingData(StrictModel):
    model_id: ModelId
    quotes: tuple[PricingQuote, ...]


class SearchProviderDocsInput(StrictModel):
    model_id: ModelId
    query: Annotated[
        str,
        StringConstraints(min_length=1, max_length=500),
        AfterValidator(_validate_clean_text),
    ]
    doc_kinds: tuple[ProviderSourceKind, ...]

    @field_validator("doc_kinds")
    @classmethod
    def validate_doc_kinds(cls, value: tuple[ProviderSourceKind, ...]) -> tuple[ProviderSourceKind, ...]:
        if not value:
            raise ValueError("docKinds must not be empty")
        if len(value) != len(set(value)):
            raise ValueError("docKinds must not contain duplicates")
        return value


class DocumentMatch(StrictModel):
    model_id: ModelId
    provider_id: ProviderId
    provider_model_id: NonEmptyString
    kind: ProviderSourceKind
    title: NonEmptyString
    url: NonEmptyString
    observed_at: date
    excerpt: NonEmptyString


class SourceAttemptStatus(StrEnum):
    MATCHED = "matched"
    NO_MATCH = "no_match"
    TIMEOUT = "timeout"
    UNAVAILABLE = "unavailable"
    PARSE_FAILED = "parse_failed"
    SOURCE_NOT_ALLOWLISTED = "source_not_allowlisted"


class ProviderSourceAttempt(StrictModel):
    url: NonEmptyString
    status: SourceAttemptStatus
    reason: NonEmptyString | None = None


class SearchProviderDocsData(StrictModel):
    model_id: ModelId
    matches: tuple[DocumentMatch, ...]
    source_attempts: tuple[ProviderSourceAttempt, ...]


class ProposedBenchmarkObservation(StrictModel):
    benchmark_id: BenchmarkId
    value: FiniteFloat
    unit: Literal["%", "index"]
    model_version: NonEmptyString
    source_version_id: NonEmptyString
    observed_at: date
    citation_ids: Annotated[tuple[CitationId, ...], Field(max_length=20)]

    @field_validator("citation_ids")
    @classmethod
    def validate_citation_ids(cls, value: tuple[NonEmptyString, ...]) -> tuple[NonEmptyString, ...]:
        if not value:
            raise ValueError("citationIds must not be empty")
        if len(value) != len(set(value)):
            raise ValueError("citationIds must not contain duplicates")
        return value


class PrepareDataUpdateInput(StrictModel):
    model_id: ModelId
    proposed_observations: Annotated[tuple[ProposedBenchmarkObservation, ...], Field(max_length=6)]
    citations: Annotated[tuple[Citation, ...], Field(max_length=20)]
    reason: Annotated[
        str,
        StringConstraints(min_length=1, max_length=2_000),
        AfterValidator(_validate_clean_text),
    ]

    @model_validator(mode="after")
    def validate_contents(self) -> PrepareDataUpdateInput:
        if not self.proposed_observations:
            raise ValueError("proposedObservations must not be empty")
        if not self.citations:
            raise ValueError("citations must not be empty")
        citation_ids = [citation.citation_id for citation in self.citations]
        if len(citation_ids) != len(set(citation_ids)):
            raise ValueError("citations must use unique citationIds")
        return self


class ProposalAction(StrEnum):
    ADD = "add"
    REPLACE = "replace"


class ProposalChange(StrictModel):
    action: ProposalAction
    benchmark_id: BenchmarkId
    before: BenchmarkObservation | None
    after: ProposedBenchmarkObservation


class ProposalRisk(StrictModel):
    code: NonEmptyString
    message: NonEmptyString
    path: NonEmptyString | None = None


class ProposalStatus(StrEnum):
    AWAITING_HUMAN_REVIEW = "awaiting_human_review"


class UpdateProposal(StrictModel):
    proposal_id: NonEmptyString
    status: ProposalStatus
    model_id: ModelId
    reason: NonEmptyString
    changes: tuple[ProposalChange, ...]
    citations: tuple[Citation, ...]
    risks: tuple[ProposalRisk, ...]


class ExactResolutionStatus(StrEnum):
    EXACT = "exact"
    UNKNOWN = "unknown"
    AMBIGUOUS = "ambiguous"


class ExactModelResolution(StrictModel):
    query: NonEmptyString
    status: ExactResolutionStatus
    model_ids: tuple[ModelId, ...]


class AgentIntent(StrEnum):
    RECOMMEND = "recommend"
    EXPLAIN_UNRANKED = "explain_unranked"
    PREPARE_UPDATE = "prepare_update"


class RunStatus(StrEnum):
    RUNNING = "running"
    NEEDS_CLARIFICATION = "needs_clarification"
    COMPLETED = "completed"
    AWAITING_HUMAN_REVIEW = "awaiting_human_review"
    FAILED = "failed"


class AgentRequest(StrictModel):
    message: Annotated[
        str,
        StringConstraints(min_length=1, max_length=10_000),
        AfterValidator(_validate_clean_text),
    ]
    session_id: NonEmptyString | None = None


class SelectionConstraints(StrictModel):
    task: ModelTask | None = None
    monthly_budget: NonNegativeFloat | None = None
    currency: CurrencyCode | None = None
    provider_region_id: RegionId | None = None
    end_user_country: NonEmptyString | None = None
    max_latency_ms: PositiveInt | None = None
    license_policy: LicensePolicy = LicensePolicy.ANY
    open_weights_required: bool = False
    input_tokens: NonNegativeInt | None = None
    cached_input_tokens: NonNegativeInt | None = None
    output_tokens: NonNegativeInt | None = None
    monthly_request_count: PositiveInt | None = None
    as_of: date | None = None


class EvidenceGap(StrictModel):
    code: NonEmptyString
    message: NonEmptyString
    field: NonEmptyString | None = None


class ModelEvidence(StrictModel):
    model_id: ModelId
    benchmarks: tuple[BenchmarkObservation, ...] = ()
    pricing: tuple[PricingQuote, ...] = ()
    documents: tuple[DocumentMatch, ...] = ()
    gaps: tuple[EvidenceGap, ...] = ()


class RecommendationExclusion(StrictModel):
    model_id: ModelId
    reasons: tuple[NonEmptyString, ...]


class Recommendation(StrictModel):
    selected_model_id: ModelId | None
    rationale: tuple[NonEmptyString, ...]
    evidence: tuple[ModelEvidence, ...]
    exclusions: tuple[RecommendationExclusion, ...]
