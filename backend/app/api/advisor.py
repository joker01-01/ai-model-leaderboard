"""Non-streaming public endpoint for deterministic AA recommendations."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Coroutine
from dataclasses import dataclass
from decimal import Decimal
from ipaddress import IPv4Network, IPv6Network, ip_address
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from app.api.advisor_contracts import (
    AdvisorAaSourceResponse,
    AdvisorCandidateResponse,
    AdvisorMetricsResponse,
    AdvisorOutcome,
    AdvisorRecommendationRequest,
    AdvisorRecommendationResponse,
    ParsedAdvisorNeedResponse,
)
from app.api.contracts import ApiBoundaryError, ApiErrorCode, ApiErrorResponse
from app.domain.advisor import (
    AbilityPurpose,
    ParsedAdvisorNeed,
    PromotedObjective,
    RankedAdvisorCandidate,
    VerificationStatus,
    VerifiedAdvisorCandidate,
)
from app.repositories.aa_snapshot import AaSnapshotRepository
from app.services.advisor_gateway import AdvisorGateway, AdvisorGatewayError
from app.services.advisor_rate_limit import NonBlockingConcurrencyGate, SlidingWindowRateLimiter
from app.services.advisor_selector import select_verification_pool

logger = logging.getLogger(__name__)

IpNetwork = IPv4Network | IPv6Network


@dataclass(frozen=True, slots=True)
class AdvisorRuntime:
    snapshot_repository: AaSnapshotRepository
    gateway: AdvisorGateway
    rate_limiter: SlidingWindowRateLimiter
    provider_gate: NonBlockingConcurrencyGate
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


def _candidate_reason(need: ParsedAdvisorNeed) -> str:
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
    knowledge_notes: dict[int, str],
) -> AdvisorCandidateResponse:
    candidate = item.candidate
    model = candidate.model
    reason = _candidate_reason(need)
    knowledge_note = knowledge_notes.get(candidate.candidate_slot)
    if knowledge_note is not None:
        reason = f"{reason} 模型知识参考（未联网核验）：{knowledge_note}"
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
        reason=reason,
        verification_status=VerificationStatus.AA_ONLY,
        checks=(),
    )


def _aa_only_candidates(pool: tuple[RankedAdvisorCandidate, ...]) -> tuple[VerifiedAdvisorCandidate, ...]:
    return tuple(VerifiedAdvisorCandidate(candidate=candidate) for candidate in pool[:3])


def _response(
    runtime: AdvisorRuntime,
    *,
    need: ParsedAdvisorNeed,
    candidates: tuple[VerifiedAdvisorCandidate, ...],
    knowledge_notes: dict[int, str] | None = None,
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
            knowledge_notes=knowledge_notes or {},
        )
        for candidate in candidates[:3]
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
        verification_status=VerificationStatus.AA_ONLY,
        recommendation=mapped[0],
        alternatives=mapped[1:],
        rejections=(),
        citations=(),
    )


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
            candidates=_aa_only_candidates(fallback_pool),
        )

    pool = select_verification_pool(runtime.snapshot_repository.models, need, budget)
    if not pool:
        return _response(
            runtime,
            need=need,
            candidates=(),
        )

    visible_pool = pool[:3]
    candidates = _aa_only_candidates(visible_pool)
    lease = await runtime.provider_gate.try_acquire()
    if lease is None:
        return _response(
            runtime,
            need=need,
            candidates=candidates,
        )
    async with lease:
        explanation_started_at = time.perf_counter()
        logger.info(
            "advisor_explanation_started stage=explanation candidate_count=%d",
            len(visible_pool),
        )
        try:
            explanations = await runtime.gateway.explain_candidates(
                visible_pool,
                need=need,
            )
            requested_slots = {candidate.candidate_slot for candidate in visible_pool}
            returned_slots = tuple(item.candidate_slot for item in explanations)
            if len(returned_slots) != len(set(returned_slots)) or set(returned_slots) != requested_slots:
                raise ValueError("advisor knowledge explanation returned a mismatched slot set")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            duration_ms = int((time.perf_counter() - explanation_started_at) * 1_000)
            failure_kind = exc.failure_kind.value if isinstance(exc, AdvisorGatewayError) else "unexpected"
            logger.info(
                "advisor_explanation_fallback stage=explanation failure_kind=%s "
                "error_type=%s duration_ms=%d candidate_count=%d",
                failure_kind,
                type(exc).__name__,
                duration_ms,
                len(visible_pool),
            )
            return _response(
                runtime,
                need=need,
                candidates=candidates,
            )
        logger.info(
            "advisor_explanation_completed stage=explanation duration_ms=%d "
            "candidate_count=%d explanation_count=%d",
            int((time.perf_counter() - explanation_started_at) * 1_000),
            len(visible_pool),
            len(explanations),
        )
    return _response(
        runtime,
        need=need,
        candidates=candidates,
        knowledge_notes={item.candidate_slot: item.knowledge_note for item in explanations},
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
