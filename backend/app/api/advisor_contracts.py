"""Strict public JSON contracts for the one-shot model advisor."""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from enum import StrEnum
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import AfterValidator, Field, StringConstraints, field_validator, model_validator

from app.api.contracts import ApiRequestModel, ApiResponseModel
from app.domain.advisor import AbilityPurpose, AdvisorBudget, HardRequirement, PromotedObjective, VerificationStatus
from app.domain.models import (
    AbsoluteHttpsUrl,
    FiniteFloat,
    NonEmptyString,
    NonNegativeFloat,
)

_MAX_SAFE_INTEGER = 9_007_199_254_740_991


def _validate_clean_text(value: str) -> str:
    if value.strip() != value:
        raise ValueError("surrounding whitespace is not allowed")
    return value


def _validate_decimal_string(value: str) -> str:
    if value.startswith(("+", "-")):
        raise ValueError("decimal value must be unsigned")
    try:
        parsed = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError("decimal value must be valid") from exc
    if not parsed.is_finite() or parsed < 0:
        raise ValueError("decimal value must be finite and non-negative")
    return value


def _validate_advisor_https_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as exc:
        raise ValueError("citation URL must be a valid absolute HTTPS URL") from exc
    if (
        parsed.scheme != "https"
        or parsed.hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or port not in {None, 443}
        or parsed.fragment
    ):
        raise ValueError("citation URL must be a valid absolute HTTPS URL")
    return value


CleanRequirement = Annotated[
    str,
    StringConstraints(min_length=1, max_length=2_000),
    AfterValidator(_validate_clean_text),
]
CleanRegion = Annotated[
    str,
    StringConstraints(min_length=1, max_length=64),
    AfterValidator(_validate_clean_text),
]
DecimalString = Annotated[
    str,
    StringConstraints(min_length=1, max_length=128, pattern=r"^[0-9]+(?:\.[0-9]+)?$"),
    AfterValidator(_validate_decimal_string),
]
EstimatedCostDecimalString = Annotated[
    str,
    StringConstraints(min_length=1, max_length=512, pattern=r"^[0-9]+(?:\.[0-9]+)?$"),
    AfterValidator(_validate_decimal_string),
]
BoundedAdvisorSummary = Annotated[NonEmptyString, StringConstraints(max_length=500)]
AdvisorHttpsUrl = Annotated[
    str,
    StringConstraints(min_length=1, max_length=2_048),
    AfterValidator(_validate_clean_text),
    AfterValidator(_validate_advisor_https_url),
]


class AdvisorBudgetRequest(ApiRequestModel):
    currency: Literal["USD"]
    monthly_budget: DecimalString
    average_input_tokens: Annotated[int, Field(ge=0, le=_MAX_SAFE_INTEGER)]
    average_output_tokens: Annotated[int, Field(ge=0, le=_MAX_SAFE_INTEGER)]
    monthly_request_count: Annotated[int, Field(gt=0, le=_MAX_SAFE_INTEGER)]

    def to_domain(self) -> AdvisorBudget:
        return AdvisorBudget(
            currency=self.currency,
            monthly_budget_usd=Decimal(self.monthly_budget),
            average_input_tokens=self.average_input_tokens,
            average_output_tokens=self.average_output_tokens,
            monthly_request_count=self.monthly_request_count,
        )


class AdvisorRecommendationRequest(ApiRequestModel):
    requirement: CleanRequirement
    deployment_region: CleanRegion | None
    budget: AdvisorBudgetRequest | None


class AdvisorOutcome(StrEnum):
    RECOMMENDATION = "recommendation"
    NO_ELIGIBLE_CANDIDATE = "no_eligible_candidate"


class AdvisorCheckRequirement(StrEnum):
    MODEL_IDENTITY = "model_identity"
    OPEN_WEIGHTS = "open_weights"
    API_ACCESS = "api_access"
    TOOL_USE = "tool_use"
    COMMERCIAL_USE = "commercial_use"
    DEPLOYMENT_REGION = "deployment_region"


class AdvisorCheckStatus(StrEnum):
    SATISFIED = "satisfied"
    UNVERIFIED = "unverified"


class AdvisorContradictionRequirement(StrEnum):
    OPEN_WEIGHTS = "open_weights"
    API_ACCESS = "api_access"
    TOOL_USE = "tool_use"
    COMMERCIAL_USE = "commercial_use"
    DEPLOYMENT_REGION = "deployment_region"


class AdvisorAaSourceResponse(ApiResponseModel):
    url: AbsoluteHttpsUrl
    observed_at: date
    schema_fingerprint: NonEmptyString


class ParsedAdvisorNeedResponse(ApiResponseModel):
    ability_purposes: tuple[AbilityPurpose, ...]
    promoted_objective: PromotedObjective | None
    hard_requirements: tuple[HardRequirement, ...]


class AdvisorMetricsResponse(ApiResponseModel):
    intelligence: FiniteFloat | None
    coding: FiniteFloat | None
    agentic: FiniteFloat | None
    input_price_per_million: NonNegativeFloat | None
    output_price_per_million: NonNegativeFloat | None
    time_to_first_answer_seconds: NonNegativeFloat | None
    output_tokens_per_second: NonNegativeFloat | None


class AdvisorEvidenceCheckResponse(ApiResponseModel):
    requirement: AdvisorCheckRequirement
    status: AdvisorCheckStatus
    summary: NonEmptyString
    citation_ids: Annotated[tuple[NonEmptyString, ...], Field(max_length=20)]

    @field_validator("citation_ids")
    @classmethod
    def validate_unique_citation_ids(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if len(value) != len(set(value)):
            raise ValueError("citationIds must not contain duplicates")
        return value


class AdvisorCandidateResponse(ApiResponseModel):
    source_id: NonEmptyString
    source_slug: NonEmptyString | None
    raw_name: NonEmptyString | None
    creator_id: NonEmptyString | None
    creator_name: NonEmptyString | None
    release_date: date | None
    observed_at: date
    metrics: AdvisorMetricsResponse
    estimated_monthly_cost_usd: EstimatedCostDecimalString | None
    reason: NonEmptyString
    verification_status: VerificationStatus
    checks: Annotated[tuple[AdvisorEvidenceCheckResponse, ...], Field(max_length=6)]

    @model_validator(mode="after")
    def validate_unique_checks(self) -> AdvisorCandidateResponse:
        requirements = tuple(check.requirement for check in self.checks)
        if len(requirements) != len(set(requirements)):
            raise ValueError("candidate checks must use unique requirements")
        return self


class AdvisorCitationResponse(ApiResponseModel):
    citation_id: NonEmptyString
    title: NonEmptyString
    url: AdvisorHttpsUrl


class AdvisorContradictionResponse(ApiResponseModel):
    requirement: AdvisorContradictionRequirement
    status: Literal["contradicted"]
    summary: BoundedAdvisorSummary
    citation_ids: Annotated[tuple[NonEmptyString, ...], Field(min_length=1, max_length=20)]

    @field_validator("citation_ids")
    @classmethod
    def validate_unique_citation_ids(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if len(value) != len(set(value)):
            raise ValueError("contradiction citationIds must not contain duplicates")
        return value


class AdvisorRejectionIdentityCheckResponse(ApiResponseModel):
    requirement: Literal["model_identity"]
    status: Literal["satisfied"]
    summary: BoundedAdvisorSummary
    citation_ids: Annotated[tuple[NonEmptyString, ...], Field(min_length=1, max_length=20)]

    @field_validator("citation_ids")
    @classmethod
    def validate_unique_citation_ids(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if len(value) != len(set(value)):
            raise ValueError("identity check citationIds must not contain duplicates")
        return value


class AdvisorRejectedCandidateResponse(ApiResponseModel):
    source_id: NonEmptyString
    source_slug: NonEmptyString | None
    raw_name: NonEmptyString | None
    creator_id: NonEmptyString | None
    creator_name: NonEmptyString | None
    identity_check: AdvisorRejectionIdentityCheckResponse
    contradictions: Annotated[tuple[AdvisorContradictionResponse, ...], Field(min_length=1, max_length=5)]

    @model_validator(mode="after")
    def validate_unique_contradictions(self) -> AdvisorRejectedCandidateResponse:
        requirements = tuple(item.requirement for item in self.contradictions)
        if len(requirements) != len(set(requirements)):
            raise ValueError("rejection contradictions must use unique requirements")
        return self


class AdvisorRecommendationResponse(ApiResponseModel):
    outcome: AdvisorOutcome
    aa_source: AdvisorAaSourceResponse
    parsed_need: ParsedAdvisorNeedResponse
    verification_status: VerificationStatus
    recommendation: AdvisorCandidateResponse | None
    alternatives: Annotated[tuple[AdvisorCandidateResponse, ...], Field(max_length=2)]
    rejections: Annotated[tuple[AdvisorRejectedCandidateResponse, ...], Field(max_length=5)]
    citations: tuple[AdvisorCitationResponse, ...]

    @model_validator(mode="after")
    def validate_response_shape(self) -> AdvisorRecommendationResponse:
        has_recommendation = self.recommendation is not None
        if has_recommendation != (self.outcome == AdvisorOutcome.RECOMMENDATION):
            raise ValueError("outcome must agree with recommendation presence")

        candidates = (() if self.recommendation is None else (self.recommendation,)) + self.alternatives
        source_ids = [candidate.source_id for candidate in candidates]
        if len(source_ids) != len(set(source_ids)):
            raise ValueError("recommendation and alternatives must use unique sourceIds")
        if self.recommendation is None and self.alternatives:
            raise ValueError("alternatives require a primary recommendation")
        if self.recommendation is not None and self.rejections:
            raise ValueError("recommendation responses cannot contain rejected candidates")
        if any(candidate.observed_at != self.aa_source.observed_at for candidate in candidates):
            raise ValueError("candidate observed dates must match the AA source")
        if self.recommendation is None:
            expected_status = VerificationStatus.PARTIAL if self.rejections else VerificationStatus.AA_ONLY
            if self.verification_status != expected_status:
                raise ValueError("no-candidate verification status must agree with live rejections")
            if bool(self.citations) != bool(self.rejections):
                raise ValueError("no-candidate citations must agree with live rejections")
        elif self.verification_status != self.recommendation.verification_status:
            raise ValueError("top-level verification status must match the primary recommendation")

        rejection_ids = [rejection.source_id for rejection in self.rejections]
        if len(rejection_ids) != len(set(rejection_ids)):
            raise ValueError("rejected candidates must use unique sourceIds")
        if set(source_ids).intersection(rejection_ids):
            raise ValueError("selected and rejected candidate sourceIds must be disjoint")

        citation_ids = [citation.citation_id for citation in self.citations]
        citation_urls = [citation.url for citation in self.citations]
        if len(citation_ids) != len(set(citation_ids)):
            raise ValueError("citations must use unique citationIds")
        if len(citation_urls) != len(set(citation_urls)):
            raise ValueError("citations must use unique URLs")

        referenced_ids = {
            citation_id
            for candidate in candidates
            for check in candidate.checks
            for citation_id in check.citation_ids
        }
        referenced_ids.update(
            citation_id
            for rejection in self.rejections
            for citation_id in rejection.identity_check.citation_ids
        )
        referenced_ids.update(
            citation_id
            for rejection in self.rejections
            for check in rejection.contradictions
            for citation_id in check.citation_ids
        )
        available_ids = set(citation_ids)
        if not referenced_ids.issubset(available_ids):
            raise ValueError("checks must reference existing citations")
        if available_ids != referenced_ids:
            raise ValueError("every citation must be referenced by a candidate check")
        if any(
            candidate.verification_status == VerificationStatus.AA_ONLY and candidate.checks
            for candidate in candidates
        ):
            raise ValueError("aa_only candidates cannot contain live verification checks")
        if any(
            candidate.verification_status != VerificationStatus.AA_ONLY
            and not any(check.citation_ids for check in candidate.checks)
            for candidate in candidates
        ):
            raise ValueError("live-verified candidates require accepted cited checks")
        if any(
            check.status == AdvisorCheckStatus.SATISFIED and not check.citation_ids
            for candidate in candidates
            for check in candidate.checks
        ):
            raise ValueError("satisfied checks require an accepted citation")
        if self.verification_status != VerificationStatus.AA_ONLY and not self.citations:
            raise ValueError("live verification status requires at least one accepted citation")
        return self
