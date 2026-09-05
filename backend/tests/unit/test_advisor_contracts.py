"""Strict wire-contract tests for the public advisor response."""

from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError

from app.api.advisor_contracts import (
    AdvisorAaSourceResponse,
    AdvisorCandidateResponse,
    AdvisorCheckRequirement,
    AdvisorCheckStatus,
    AdvisorCitationResponse,
    AdvisorContradictionRequirement,
    AdvisorContradictionResponse,
    AdvisorEvidenceCheckResponse,
    AdvisorMetricsResponse,
    AdvisorOutcome,
    AdvisorRecommendationResponse,
    AdvisorRejectedCandidateResponse,
    AdvisorRejectionIdentityCheckResponse,
    ParsedAdvisorNeedResponse,
)
from app.domain.advisor import AbilityPurpose, VerificationStatus


def _candidate(
    source_id: str,
    *,
    status: VerificationStatus,
    checks: tuple[AdvisorEvidenceCheckResponse, ...] = (),
) -> AdvisorCandidateResponse:
    return AdvisorCandidateResponse(
        source_id=source_id,
        source_slug=None,
        raw_name="Test model",
        creator_id=None,
        creator_name=None,
        release_date=None,
        observed_at=date(2026, 9, 4),
        metrics=AdvisorMetricsResponse(
            intelligence=0.0,
            coding=None,
            agentic=None,
            input_price_per_million=0.0,
            output_price_per_million=None,
            time_to_first_answer_seconds=None,
            output_tokens_per_second=None,
        ),
        estimated_monthly_cost_usd="00.50",
        reason="Deterministic AA ordering.",
        verification_status=status,
        checks=checks,
    )


def _response(
    recommendation: AdvisorCandidateResponse | None,
    *,
    status: VerificationStatus,
    alternatives: tuple[AdvisorCandidateResponse, ...] = (),
    rejections: tuple[AdvisorRejectedCandidateResponse, ...] = (),
    citations: tuple[AdvisorCitationResponse, ...] = (),
) -> AdvisorRecommendationResponse:
    return AdvisorRecommendationResponse(
        outcome=(
            AdvisorOutcome.NO_ELIGIBLE_CANDIDATE
            if recommendation is None
            else AdvisorOutcome.RECOMMENDATION
        ),
        aa_source=AdvisorAaSourceResponse(
            url="https://artificialanalysis.ai/",
            observed_at=date(2026, 9, 4),
            schema_fingerprint="sha256:test",
        ),
        parsed_need=ParsedAdvisorNeedResponse(
            ability_purposes=(AbilityPurpose.INTELLIGENCE,),
            promoted_objective=None,
            hard_requirements=(),
        ),
        verification_status=status,
        recommendation=recommendation,
        alternatives=alternatives,
        rejections=rejections,
        citations=citations,
    )


def test_primary_status_must_match_but_alternative_status_may_differ() -> None:
    citation = AdvisorCitationResponse(
        citation_id="citation-1",
        title="Official source",
        url="https://openai.com:443/models/test",
    )
    cited_check = AdvisorEvidenceCheckResponse(
        requirement=AdvisorCheckRequirement.MODEL_IDENTITY,
        status=AdvisorCheckStatus.SATISFIED,
        summary="Official source identifies the model.",
        citation_ids=(citation.citation_id,),
    )
    primary = _candidate("primary", status=VerificationStatus.AA_ONLY)
    alternative = _candidate(
        "alternative",
        status=VerificationStatus.VERIFIED,
        checks=(cited_check,),
    )

    response = _response(
        primary,
        status=VerificationStatus.AA_ONLY,
        alternatives=(alternative,),
        citations=(citation,),
    )

    assert response.alternatives[0].verification_status == VerificationStatus.VERIFIED
    with pytest.raises(ValidationError, match="top-level verification status"):
        _response(primary, status=VerificationStatus.PARTIAL)


def test_satisfied_checks_require_an_accepted_citation() -> None:
    uncited = AdvisorEvidenceCheckResponse(
        requirement=AdvisorCheckRequirement.MODEL_IDENTITY,
        status=AdvisorCheckStatus.SATISFIED,
        summary="Unsupported claim.",
        citation_ids=(),
    )

    with pytest.raises(ValidationError, match="accepted cited checks|accepted citation"):
        _response(
            _candidate("model", status=VerificationStatus.PARTIAL, checks=(uncited,)),
            status=VerificationStatus.PARTIAL,
        )


def test_aa_only_and_no_candidate_shapes_cannot_carry_live_evidence() -> None:
    check = AdvisorEvidenceCheckResponse(
        requirement=AdvisorCheckRequirement.MODEL_IDENTITY,
        status=AdvisorCheckStatus.UNVERIFIED,
        summary="Unverified source.",
        citation_ids=("citation-1",),
    )
    citation = AdvisorCitationResponse(
        citation_id="citation-1",
        title="Official source",
        url="https://openai.com/models/test",
    )

    with pytest.raises(ValidationError, match="aa_only candidates"):
        _response(
            _candidate("model", status=VerificationStatus.AA_ONLY, checks=(check,)),
            status=VerificationStatus.AA_ONLY,
            citations=(citation,),
        )
    with pytest.raises(ValidationError, match="no-candidate verification status"):
        _response(None, status=VerificationStatus.PARTIAL)


def test_live_exclusion_requires_identity_and_contradiction_citation_closure() -> None:
    identity_citation = AdvisorCitationResponse(
        citation_id="identity",
        title="Official model identity",
        url="https://openai.com/models/test",
    )
    contradiction_citation = AdvisorCitationResponse(
        citation_id="contradiction",
        title="Official API documentation",
        url="https://platform.openai.com/docs/models/test",
    )
    rejection = AdvisorRejectedCandidateResponse(
        source_id="model",
        source_slug=None,
        raw_name="Test model",
        creator_id="openai",
        creator_name="OpenAI",
        identity_check=AdvisorRejectionIdentityCheckResponse(
            requirement="model_identity",
            status="satisfied",
            summary="The official page identifies this model.",
            citation_ids=(identity_citation.citation_id,),
        ),
        contradictions=(
            AdvisorContradictionResponse(
                requirement=AdvisorContradictionRequirement.API_ACCESS,
                status="contradicted",
                summary="The official documentation contradicts API access.",
                citation_ids=(contradiction_citation.citation_id,),
            ),
        ),
    )

    response = _response(
        None,
        status=VerificationStatus.PARTIAL,
        rejections=(rejection,),
        citations=(identity_citation, contradiction_citation),
    )

    assert response.rejections == (rejection,)
    with pytest.raises(ValidationError, match="checks must reference existing citations"):
        _response(
            None,
            status=VerificationStatus.PARTIAL,
            rejections=(rejection,),
            citations=(contradiction_citation,),
        )


def test_citation_url_accepts_default_https_port_only() -> None:
    assert AdvisorCitationResponse(
        citation_id="citation-1",
        title="Official source",
        url="https://openai.com:443/models/test",
    ).url.endswith("/models/test")

    with pytest.raises(ValidationError, match="valid absolute HTTPS URL"):
        AdvisorCitationResponse(
            citation_id="citation-1",
            title="Official source",
            url="https://openai.com:444/models/test",
        )
