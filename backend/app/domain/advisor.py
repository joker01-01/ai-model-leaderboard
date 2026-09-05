"""Immutable contracts for the source-native public advisor domain."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import AfterValidator, Field, StringConstraints, field_validator, model_validator

from app.domain.models import (
    CitationId,
    FiniteFloat,
    NonEmptyString,
    NonNegativeDecimal,
    NonNegativeFloat,
    NonNegativeInt,
    PositiveInt,
    StrictModel,
)


class AbilityPurpose(StrEnum):
    INTELLIGENCE = "intelligence"
    CODING = "coding"
    AGENTIC = "agentic"


class PromotedObjective(StrEnum):
    STRONGEST = "strongest"
    FASTEST = "fastest"
    CHEAPEST = "cheapest"


class HardRequirement(StrEnum):
    OPEN_WEIGHTS = "open_weights"
    API_ACCESS = "api_access"
    TOOL_USE = "tool_use"
    COMMERCIAL_USE = "commercial_use"


class EvidenceVerdict(StrEnum):
    SATISFIED = "satisfied"
    CONTRADICTED = "contradicted"
    UNVERIFIED = "unverified"


class VerificationStatus(StrEnum):
    VERIFIED = "verified"
    PARTIAL = "partial"
    AA_ONLY = "aa_only"


class OfficialSourceKind(StrEnum):
    OFFICIAL_SITE = "official_site"
    OFFICIAL_GITHUB = "official_github"
    ARTIFICIAL_ANALYSIS = "artificial_analysis"


class VerificationCheckKind(StrEnum):
    MODEL_IDENTITY = "model_identity"
    OPEN_WEIGHTS = "open_weights"
    API_ACCESS = "api_access"
    TOOL_USE = "tool_use"
    COMMERCIAL_USE = "commercial_use"
    DEPLOYMENT_REGION = "deployment_region"


class ParsedAdvisorNeed(StrictModel):
    """The complete and only model-produced advisor intent contract."""

    ability_purposes: Annotated[tuple[AbilityPurpose, ...], Field(min_length=1, max_length=3)]
    promoted_objective: PromotedObjective | None = None
    hard_requirements: Annotated[tuple[HardRequirement, ...], Field(max_length=4)] = ()

    @field_validator("ability_purposes", "hard_requirements")
    @classmethod
    def validate_unique_values(cls, value: tuple[StrEnum, ...]) -> tuple[StrEnum, ...]:
        if len(value) != len(set(value)):
            raise ValueError("advisor intent lists must not contain duplicates")
        return value

    @classmethod
    def default(cls) -> ParsedAdvisorNeed:
        return cls(ability_purposes=(AbilityPurpose.INTELLIGENCE,))


class AdvisorBudget(StrictModel):
    """Validated USD usage inputs used only by deterministic selection."""

    currency: Literal["USD"] = "USD"
    monthly_budget_usd: NonNegativeDecimal
    average_input_tokens: NonNegativeInt
    average_output_tokens: NonNegativeInt
    monthly_request_count: PositiveInt


class AaPublicPagination(StrictModel):
    page_size: PositiveInt
    total_pages: Annotated[int, Field(ge=1, le=50)]
    declared_total_rows: None
    fetched_row_count: PositiveInt

    @model_validator(mode="after")
    def validate_page_proof(self) -> AaPublicPagination:
        if self.fetched_row_count > self.page_size * self.total_pages:
            raise ValueError("fetchedRowCount exceeds pagination capacity")
        if self.total_pages > 1 and self.fetched_row_count <= self.page_size * (self.total_pages - 1):
            raise ValueError("fetchedRowCount does not prove the final page was reached")
        return self


class AaPublicSource(StrictModel):
    url: NonEmptyString
    observed_at: date
    schema_fingerprint: NonEmptyString
    intelligence_index_version: Annotated[FiniteFloat, Field(gt=0)]
    pagination: AaPublicPagination


class AaPublicModel(StrictModel):
    source_id: NonEmptyString
    source_slug: NonEmptyString | None
    raw_name: NonEmptyString | None
    creator_id: NonEmptyString | None
    creator_name: NonEmptyString | None
    release_date: date | None
    observed_at: date
    intelligence: FiniteFloat | None
    coding: FiniteFloat | None
    agentic: FiniteFloat | None
    input_price_per_million: NonNegativeFloat | None
    output_price_per_million: NonNegativeFloat | None
    time_to_first_answer_seconds: NonNegativeFloat | None
    output_tokens_per_second: NonNegativeFloat | None


class AaPublicSnapshot(StrictModel):
    schema_version: Literal[1]
    source: AaPublicSource
    models: tuple[AaPublicModel, ...]

    @model_validator(mode="after")
    def validate_collection(self) -> AaPublicSnapshot:
        if len(self.models) != self.source.pagination.fetched_row_count:
            raise ValueError("models length must equal fetchedRowCount")

        source_ids = tuple(model.source_id for model in self.models)
        if len(source_ids) != len(set(source_ids)):
            raise ValueError("models must use unique sourceId values")
        if source_ids != tuple(sorted(source_ids)):
            raise ValueError("models must be ordered by sourceId")
        if any(model.observed_at != self.source.observed_at for model in self.models):
            raise ValueError("model observedAt values must match source observedAt")
        return self


class RankedAdvisorCandidate(StrictModel):
    """One immutable AA-derived row in the five-candidate verification pool."""

    candidate_slot: Annotated[int, Field(ge=0, lt=5)]
    model: AaPublicModel
    estimated_monthly_cost_usd: Decimal | None = None


BoundedEvidenceText = Annotated[NonEmptyString, StringConstraints(max_length=500)]


def _validate_official_citation_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as exc:
        raise ValueError("official citation URL must be a valid absolute HTTPS URL") from exc
    if (
        parsed.scheme != "https"
        or parsed.hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or port not in {None, 443}
        or parsed.fragment
    ):
        raise ValueError("official citation URL must be a valid absolute HTTPS URL")
    return value


BoundedCitationUrl = Annotated[
    NonEmptyString,
    StringConstraints(max_length=2_048),
    AfterValidator(_validate_official_citation_url),
]


class OfficialCitation(StrictModel):
    citation_id: CitationId
    title: BoundedEvidenceText
    url: BoundedCitationUrl
    source_kind: OfficialSourceKind
    creator_id: NonEmptyString | None = None


class CandidateEvidenceCheck(StrictModel):
    check: VerificationCheckKind
    verdict: EvidenceVerdict
    summary: BoundedEvidenceText | None = None
    citation_ids: Annotated[tuple[CitationId, ...], Field(max_length=20)] = ()

    @field_validator("citation_ids")
    @classmethod
    def validate_unique_citations(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if len(value) != len(set(value)):
            raise ValueError("citationIds must not contain duplicates")
        return value

    @model_validator(mode="after")
    def validate_evidence_for_conclusive_verdict(self) -> CandidateEvidenceCheck:
        if self.verdict != EvidenceVerdict.UNVERIFIED and not self.citation_ids:
            raise ValueError("satisfied and contradicted checks require accepted citations")
        return self


class CandidateVerification(StrictModel):
    """Locally validated evidence for one server-owned pool slot."""

    candidate_slot: Annotated[int, Field(ge=0, lt=5)]
    checks: Annotated[tuple[CandidateEvidenceCheck, ...], Field(max_length=6)] = ()
    citations: Annotated[tuple[OfficialCitation, ...], Field(max_length=20)] = ()

    @model_validator(mode="after")
    def validate_evidence_graph(self) -> CandidateVerification:
        check_kinds = tuple(check.check for check in self.checks)
        if len(check_kinds) != len(set(check_kinds)):
            raise ValueError("checks must use unique check kinds")
        if VerificationCheckKind.MODEL_IDENTITY not in check_kinds:
            raise ValueError("candidate verification must include model_identity")

        citation_ids = tuple(citation.citation_id for citation in self.citations)
        if len(citation_ids) != len(set(citation_ids)):
            raise ValueError("citations must use unique citationIds")
        known_ids = set(citation_ids)
        referenced_ids = {citation_id for check in self.checks for citation_id in check.citation_ids}
        if not referenced_ids.issubset(known_ids):
            raise ValueError("checks may reference only accepted candidate citations")
        if known_ids != referenced_ids:
            raise ValueError("every candidate citation must support a displayed check")
        return self


class VerifiedAdvisorCandidate(StrictModel):
    candidate: RankedAdvisorCandidate
    verification: CandidateVerification | None = None
