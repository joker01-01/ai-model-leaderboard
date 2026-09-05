"""Non-streaming public endpoint for deterministic AA recommendations."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine
from dataclasses import dataclass
from decimal import Decimal
from ipaddress import IPv4Network, IPv6Network, ip_address
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

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
    AdvisorRecommendationRequest,
    AdvisorRecommendationResponse,
    AdvisorRejectedCandidateResponse,
    AdvisorRejectionIdentityCheckResponse,
    ParsedAdvisorNeedResponse,
)
from app.api.contracts import ApiBoundaryError, ApiErrorCode, ApiErrorResponse
from app.domain.advisor import (
    AbilityPurpose,
    CandidateVerification,
    EvidenceVerdict,
    OfficialSourceKind,
    ParsedAdvisorNeed,
    PromotedObjective,
    RankedAdvisorCandidate,
    VerificationCheckKind,
    VerificationStatus,
    VerifiedAdvisorCandidate,
)
from app.repositories.aa_snapshot import AaSnapshotRepository
from app.repositories.official_sources import OfficialSourcesRepository
from app.services.advisor_gateway import AdvisorGateway
from app.services.advisor_rate_limit import NonBlockingConcurrencyGate, SlidingWindowRateLimiter
from app.services.advisor_selector import apply_verification, select_verification_pool

logger = logging.getLogger(__name__)

IpNetwork = IPv4Network | IPv6Network


@dataclass(frozen=True, slots=True)
class AdvisorRuntime:
    snapshot_repository: AaSnapshotRepository
    official_sources: OfficialSourcesRepository
    gateway: AdvisorGateway
    rate_limiter: SlidingWindowRateLimiter
    web_gate: NonBlockingConcurrencyGate
    trusted_proxy_networks: tuple[IpNetwork, ...] = ()


router = APIRouter(prefix="/api/v1/advisor", tags=["advisor"])


def _runtime_from_request(request: Request) -> AdvisorRuntime:
    runtime = getattr(request.app.state, "advisor_runtime", None)
    if not isinstance(runtime, AdvisorRuntime):
        raise ApiBoundaryError(
            status_code=503,
            code=ApiErrorCode.SERVICE_UNAVAILABLE,
            message="The advisor runtime is not available.",
            retryable=True,
        )
    return runtime


AdvisorRuntimeDependency = Annotated[AdvisorRuntime, Depends(_runtime_from_request)]


def _client_ip(request: Request, trusted_proxy_networks: tuple[IpNetwork, ...]) -> str:
    peer = request.client.host if request.client is not None else "unknown-client"
    try:
        peer_ip = ip_address(peer)
    except ValueError:
        return peer
    if not any(peer_ip in network for network in trusted_proxy_networks):
        return peer_ip.compressed

    forwarded = request.headers.get("x-forwarded-for")
    if forwarded is None:
        return peer_ip.compressed
    raw_chain = tuple(part.strip() for part in forwarded.split(","))
    if not raw_chain or any(not part for part in raw_chain):
        return peer_ip.compressed
    try:
        chain = tuple(ip_address(part) for part in raw_chain)
    except ValueError:
        return peer_ip.compressed

    for candidate in reversed(chain):
        if not any(candidate in network for network in trusted_proxy_networks):
            return candidate.compressed
    return chain[0].compressed


async def _wait_for_disconnect(request: Request) -> None:
    while True:
        message = await request.receive()
        if message["type"] == "http.disconnect":
            return


async def _disconnect_aware[ResultT](
    request: Request,
    operation: Coroutine[Any, Any, ResultT],
) -> ResultT:
    operation_task: asyncio.Task[ResultT] = asyncio.create_task(operation)
    disconnect_task = asyncio.create_task(_wait_for_disconnect(request))
    try:
        done, _pending = await asyncio.wait(
            {operation_task, disconnect_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        if disconnect_task in done and not operation_task.done():
            operation_task.cancel()
            await asyncio.gather(operation_task, return_exceptions=True)
            raise asyncio.CancelledError
        return await operation_task
    finally:
        for task in (operation_task, disconnect_task):
            if not task.done():
                task.cancel()
        await asyncio.gather(operation_task, disconnect_task, return_exceptions=True)


def _decimal_text(value: Decimal | None) -> str | None:
    if value is None:
        return None
    if not value.is_finite() or value < 0:
        return None
    if value.is_zero():
        return "0"
    rendered = format(value, "f")
    if "." in rendered:
        rendered = rendered.rstrip("0").rstrip(".")
    if len(rendered) > 512:
        return None
    return rendered


def _candidate_status(
    candidate: RankedAdvisorCandidate,
    verification: CandidateVerification | None,
    *,
    need: ParsedAdvisorNeed,
    deployment_region: str | None,
    official_sources: OfficialSourcesRepository,
) -> VerificationStatus:
    if verification is None or not any(
        check.citation_ids and check.verdict != EvidenceVerdict.CONTRADICTED
        for check in verification.checks
    ):
        return VerificationStatus.AA_ONLY
    required = {VerificationCheckKind.MODEL_IDENTITY}
    required.update(VerificationCheckKind(item.value) for item in need.hard_requirements)
    if deployment_region is not None:
        required.add(VerificationCheckKind.DEPLOYMENT_REGION)
    satisfied = {
        check.check
        for check in verification.checks
        if check.verdict == EvidenceVerdict.SATISFIED and check.citation_ids
    }
    creator_id = candidate.model.creator_id
    registered = creator_id is not None and bool(official_sources.sources_for(creator_id))
    if registered and required.issubset(satisfied):
        return VerificationStatus.VERIFIED
    return VerificationStatus.PARTIAL


def _candidate_reason(candidate: RankedAdvisorCandidate, need: ParsedAdvisorNeed) -> str:
    purpose_labels = {
        AbilityPurpose.INTELLIGENCE: "综合智能",
        AbilityPurpose.CODING: "编程智能",
        AbilityPurpose.AGENTIC: "智能体能力",
    }
    objective_labels = {
        None: "默认",
        PromotedObjective.STRONGEST: "最强",
        PromotedObjective.FASTEST: "最快",
        PromotedObjective.CHEAPEST: "最便宜",
    }
    purposes = "、".join(purpose_labels[purpose] for purpose in need.ability_purposes)
    objective = objective_labels[need.promoted_objective]
    return f"依据 AA 的{purposes}指标并按{objective}优先级确定性排序。"


def _candidate_response(
    item: VerifiedAdvisorCandidate,
    *,
    need: ParsedAdvisorNeed,
    deployment_region: str | None,
    official_sources: OfficialSourcesRepository,
) -> AdvisorCandidateResponse:
    candidate = item.candidate
    model = candidate.model
    status = _candidate_status(
        candidate,
        item.verification,
        need=need,
        deployment_region=deployment_region,
        official_sources=official_sources,
    )
    checks: tuple[AdvisorEvidenceCheckResponse, ...] = ()
    if status != VerificationStatus.AA_ONLY and item.verification is not None:
        checks = tuple(
            AdvisorEvidenceCheckResponse(
                requirement=AdvisorCheckRequirement(check.check.value),
                status=(
                    AdvisorCheckStatus.SATISFIED
                    if check.verdict == EvidenceVerdict.SATISFIED
                    else AdvisorCheckStatus.UNVERIFIED
                ),
                summary=(
                    "当前受控来源未提供足够证据。"
                    if check.verdict == EvidenceVerdict.CONTRADICTED
                    else check.summary or "当前受控来源未提供足够证据。"
                ),
                citation_ids=(
                    () if check.verdict == EvidenceVerdict.CONTRADICTED else check.citation_ids
                ),
            )
            for check in item.verification.checks
        )
    return AdvisorCandidateResponse(
        source_id=model.source_id,
        source_slug=model.source_slug,
        raw_name=model.raw_name,
        creator_id=model.creator_id,
        creator_name=model.creator_name,
        release_date=model.release_date,
        observed_at=model.observed_at,
        metrics=AdvisorMetricsResponse(
            intelligence=model.intelligence,
            coding=model.coding,
            agentic=model.agentic,
            input_price_per_million=model.input_price_per_million,
            output_price_per_million=model.output_price_per_million,
            time_to_first_answer_seconds=model.time_to_first_answer_seconds,
            output_tokens_per_second=model.output_tokens_per_second,
        ),
        estimated_monthly_cost_usd=_decimal_text(candidate.estimated_monthly_cost_usd),
        reason=_candidate_reason(candidate, need),
        verification_status=status,
        checks=checks,
    )


def _aa_only_candidates(pool: tuple[RankedAdvisorCandidate, ...]) -> tuple[VerifiedAdvisorCandidate, ...]:
    return tuple(VerifiedAdvisorCandidate(candidate=candidate) for candidate in pool[:3])


def _validate_candidate_citation_bindings(
    pool: tuple[RankedAdvisorCandidate, ...],
    verifications: tuple[CandidateVerification, ...],
    official_sources: OfficialSourcesRepository,
) -> None:
    candidates_by_slot = {candidate.candidate_slot: candidate for candidate in pool}
    for verification in verifications:
        candidate = candidates_by_slot.get(verification.candidate_slot)
        if candidate is None:
            raise ValueError("candidate verification references a slot outside the server-owned pool")
        for citation in verification.citations:
            if citation.source_kind == OfficialSourceKind.ARTIFICIAL_ANALYSIS:
                match = official_sources.validate_aa_citation_url(citation.url)
            else:
                creator_id = candidate.model.creator_id
                if creator_id is None or citation.creator_id != creator_id:
                    raise ValueError("candidate citation uses the wrong creator binding")
                match = official_sources.validate_citation_url(creator_id, citation.url)
            if (
                match is None
                or match.source_kind != citation.source_kind
                or match.creator_id != citation.creator_id
            ):
                raise ValueError("candidate citation does not match the reviewed source registry")


def _response(
    runtime: AdvisorRuntime,
    *,
    need: ParsedAdvisorNeed,
    deployment_region: str | None,
    candidates: tuple[VerifiedAdvisorCandidate, ...],
) -> AdvisorRecommendationResponse:
    if not candidates:
        return AdvisorRecommendationResponse(
            outcome=AdvisorOutcome.NO_ELIGIBLE_CANDIDATE,
            aa_source=AdvisorAaSourceResponse(
                url=runtime.snapshot_repository.snapshot.source.url,
                observed_at=runtime.snapshot_repository.snapshot.source.observed_at,
                schema_fingerprint=runtime.snapshot_repository.snapshot.source.schema_fingerprint,
            ),
            parsed_need=ParsedAdvisorNeedResponse(
                ability_purposes=need.ability_purposes,
                promoted_objective=need.promoted_objective,
                hard_requirements=need.hard_requirements,
            ),
            verification_status=VerificationStatus.AA_ONLY,
            recommendation=None,
            alternatives=(),
            rejections=(),
            citations=(),
        )

    mapped = tuple(
        _candidate_response(
            candidate,
            need=need,
            deployment_region=deployment_region,
            official_sources=runtime.official_sources,
        )
        for candidate in candidates[:3]
    )
    primary = mapped[0]
    citations_by_id: dict[str, AdvisorCitationResponse] = {}
    for item in candidates[:3]:
        if item.verification is None:
            continue
        for citation in item.verification.citations:
            mapped_citation = AdvisorCitationResponse(
                citation_id=citation.citation_id,
                title=citation.title,
                url=citation.url,
            )
            existing = citations_by_id.get(citation.citation_id)
            if existing is not None and existing != mapped_citation:
                raise ValueError("candidate citations must bind one ID to one source")
            citations_by_id[citation.citation_id] = mapped_citation
    referenced = {
        citation_id
        for candidate in mapped
        for check in candidate.checks
        for citation_id in check.citation_ids
    }
    citations = tuple(
        citation
        for citation_id, citation in citations_by_id.items()
        if citation_id in referenced
    )
    return AdvisorRecommendationResponse(
        outcome=AdvisorOutcome.RECOMMENDATION,
        aa_source=AdvisorAaSourceResponse(
            url=runtime.snapshot_repository.snapshot.source.url,
            observed_at=runtime.snapshot_repository.snapshot.source.observed_at,
            schema_fingerprint=runtime.snapshot_repository.snapshot.source.schema_fingerprint,
        ),
        parsed_need=ParsedAdvisorNeedResponse(
            ability_purposes=need.ability_purposes,
            promoted_objective=need.promoted_objective,
            hard_requirements=need.hard_requirements,
        ),
        verification_status=primary.verification_status,
        recommendation=mapped[0],
        alternatives=mapped[1:],
        rejections=(),
        citations=citations,
    )


def _live_exclusion_response(
    runtime: AdvisorRuntime,
    *,
    need: ParsedAdvisorNeed,
    deployment_region: str | None,
    pool: tuple[RankedAdvisorCandidate, ...],
    verifications: tuple[CandidateVerification, ...],
) -> AdvisorRecommendationResponse | None:
    by_slot = {verification.candidate_slot: verification for verification in verifications}
    if len(by_slot) != len(verifications):
        return None
    rejections: list[AdvisorRejectedCandidateResponse] = []
    citations_by_id: dict[str, AdvisorCitationResponse] = {}
    for candidate in pool:
        verification = by_slot.get(candidate.candidate_slot)
        if verification is None:
            return None
        identity_checks = tuple(
            check
            for check in verification.checks
            if check.check == VerificationCheckKind.MODEL_IDENTITY
            and check.verdict == EvidenceVerdict.SATISFIED
            and check.citation_ids
        )
        if len(identity_checks) != 1:
            return None
        identity = identity_checks[0]
        identity_response = AdvisorRejectionIdentityCheckResponse(
            requirement="model_identity",
            status="satisfied",
            summary=identity.summary or "受控官方资料确认该候选模型身份。",
            citation_ids=identity.citation_ids,
        )
        explicit_kinds = {
            VerificationCheckKind(requirement.value)
            for requirement in need.hard_requirements
        }
        if deployment_region is not None:
            explicit_kinds.add(VerificationCheckKind.DEPLOYMENT_REGION)
        contradictions = tuple(
            AdvisorContradictionResponse(
                requirement=AdvisorContradictionRequirement(check.check.value),
                status="contradicted",
                summary=check.summary or "受控官方资料与该硬性要求冲突。",
                citation_ids=check.citation_ids,
            )
            for check in verification.checks
            if check.check in explicit_kinds
            and check.verdict == EvidenceVerdict.CONTRADICTED
            and check.citation_ids
        )
        if not contradictions:
            return None
        referenced = set(identity_response.citation_ids)
        referenced.update(
            citation_id
            for contradiction in contradictions
            for citation_id in contradiction.citation_ids
        )
        candidate_citations = {
            citation.citation_id: AdvisorCitationResponse(
                citation_id=citation.citation_id,
                title=citation.title,
                url=citation.url,
            )
            for citation in verification.citations
            if citation.citation_id in referenced
        }
        if set(candidate_citations) != referenced:
            return None
        for citation_id, citation in candidate_citations.items():
            existing = citations_by_id.get(citation_id)
            if existing is not None and existing != citation:
                return None
            citations_by_id[citation_id] = citation
        model = candidate.model
        rejections.append(
            AdvisorRejectedCandidateResponse(
                source_id=model.source_id,
                source_slug=model.source_slug,
                raw_name=model.raw_name,
                creator_id=model.creator_id,
                creator_name=model.creator_name,
                identity_check=identity_response,
                contradictions=contradictions,
            )
        )
    if not rejections or len(rejections) != len(pool):
        return None
    try:
        return AdvisorRecommendationResponse(
            outcome=AdvisorOutcome.NO_ELIGIBLE_CANDIDATE,
            aa_source=AdvisorAaSourceResponse(
                url=runtime.snapshot_repository.snapshot.source.url,
                observed_at=runtime.snapshot_repository.snapshot.source.observed_at,
                schema_fingerprint=runtime.snapshot_repository.snapshot.source.schema_fingerprint,
            ),
            parsed_need=ParsedAdvisorNeedResponse(
                ability_purposes=need.ability_purposes,
                promoted_objective=need.promoted_objective,
                hard_requirements=need.hard_requirements,
            ),
            verification_status=VerificationStatus.PARTIAL,
            recommendation=None,
            alternatives=(),
            rejections=tuple(rejections),
            citations=tuple(citations_by_id.values()),
        )
    except ValueError:
        return None


async def _recommend(
    payload: AdvisorRecommendationRequest,
    runtime: AdvisorRuntime,
) -> AdvisorRecommendationResponse:
    budget = None if payload.budget is None else payload.budget.to_domain()
    fallback_need = ParsedAdvisorNeed.default()
    fallback_pool = select_verification_pool(
        runtime.snapshot_repository.models,
        fallback_need,
        budget,
    )
    try:
        need = await runtime.gateway.parse_need(payload.requirement)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.info("advisor_intent_fallback error_type=%s", type(exc).__name__)
        return _response(
            runtime,
            need=fallback_need,
            deployment_region=payload.deployment_region,
            candidates=_aa_only_candidates(fallback_pool),
        )

    pool = select_verification_pool(runtime.snapshot_repository.models, need, budget)
    if not pool:
        return _response(
            runtime,
            need=need,
            deployment_region=payload.deployment_region,
            candidates=(),
        )
    lease = await runtime.web_gate.try_acquire()
    if lease is None:
        return _response(
            runtime,
            need=need,
            deployment_region=payload.deployment_region,
            candidates=_aa_only_candidates(pool),
        )
    async with lease:
        try:
            verifications = await runtime.gateway.verify_candidates(
                pool,
                need=need,
                deployment_region=payload.deployment_region,
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.info("advisor_verification_fallback error_type=%s", type(exc).__name__)
            return _response(
                runtime,
                need=need,
                deployment_region=payload.deployment_region,
                candidates=_aa_only_candidates(pool),
            )
    try:
        _validate_candidate_citation_bindings(
            pool,
            verifications,
            runtime.official_sources,
        )
        survivors = apply_verification(pool, verifications, need, payload.deployment_region)[:3]
    except (TypeError, ValueError) as exc:
        logger.info("advisor_verification_rejected error_type=%s", type(exc).__name__)
        survivors = _aa_only_candidates(pool)
    if not survivors:
        try:
            live_exclusion = _live_exclusion_response(
                runtime,
                need=need,
                deployment_region=payload.deployment_region,
                pool=pool,
                verifications=verifications,
            )
        except (TypeError, ValueError) as exc:
            logger.info("advisor_live_exclusion_rejected error_type=%s", type(exc).__name__)
            live_exclusion = None
        if live_exclusion is not None:
            return live_exclusion
        survivors = _aa_only_candidates(pool)
    try:
        return _response(
            runtime,
            need=need,
            deployment_region=payload.deployment_region,
            candidates=survivors,
        )
    except (TypeError, ValueError) as exc:
        logger.info("advisor_response_evidence_rejected error_type=%s", type(exc).__name__)
        return _response(
            runtime,
            need=need,
            deployment_region=payload.deployment_region,
            candidates=_aa_only_candidates(pool),
        )


@router.post(
    "/recommend",
    response_model=AdvisorRecommendationResponse,
    response_model_by_alias=False,
    responses={
        422: {"model": ApiErrorResponse},
        429: {"model": ApiErrorResponse},
        503: {"model": ApiErrorResponse},
    },
)
async def recommend_models(
    payload: AdvisorRecommendationRequest,
    request: Request,
    runtime: AdvisorRuntimeDependency,
) -> AdvisorRecommendationResponse:
    media_type = request.headers.get("content-type", "").partition(";")[0].strip().lower()
    if media_type != "application/json":
        raise ApiBoundaryError(
            status_code=422,
            code=ApiErrorCode.INVALID_REQUEST,
            message="Request validation failed.",
        )
    client_ip = _client_ip(request, runtime.trusted_proxy_networks)
    decision = runtime.rate_limiter.check(client_ip)
    if not decision.allowed:
        retry_after = decision.retry_after_seconds or 1
        raise ApiBoundaryError(
            status_code=429,
            code=ApiErrorCode.RATE_LIMITED,
            message="Too many advisor requests. Try again later.",
            retryable=True,
            headers={"Retry-After": str(retry_after)},
        )
    return await _disconnect_aware(request, _recommend(payload, runtime))
