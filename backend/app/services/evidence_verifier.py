"""Deterministic constraint and evidence verification for recommendations."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from decimal import Decimal

from app.domain.models import (
    BenchmarkId,
    EvidenceGap,
    LicensePolicy,
    ModelEvidence,
    PriceCalculationStatus,
    ProviderSourceKind,
    Recommendation,
    RecommendationExclusion,
    SelectionConstraints,
)

MISSING_BENCHMARK = "missing_benchmark_evidence"
MISSING_PRICING = "missing_pricing_evidence"
STALE_PRICING = "stale_pricing_evidence"
MISSING_CACHE_PRICE = "missing_cached_input_price"
MISSING_END_USER_AVAILABILITY = "missing_end_user_country_availability"
MISSING_LATENCY = "missing_latency_evidence"
MISSING_LICENSE = "missing_official_license_evidence"
OVER_BUDGET = "monthly_budget_exceeded"


def _with_gap(evidence: ModelEvidence, gap: EvidenceGap) -> ModelEvidence:
    return evidence.model_copy(update={"gaps": (*evidence.gaps, gap)})


def _coding_score(evidence: ModelEvidence) -> float | None:
    for observation in evidence.benchmarks:
        if observation.benchmark_id == BenchmarkId.AA_CODING:
            return observation.value
    return None


def _intelligence_score(evidence: ModelEvidence) -> float | None:
    for observation in evidence.benchmarks:
        if observation.benchmark_id == BenchmarkId.AA_INTELLIGENCE:
            return observation.value
    return None


class EvidenceVerifier:
    """Apply repository-backed constraints without asking an LLM to rank evidence."""

    def recommend(
        self,
        constraints: SelectionConstraints,
        evidence_by_model: Mapping[str, ModelEvidence],
    ) -> Recommendation:
        verified: list[ModelEvidence] = []
        exclusions: list[RecommendationExclusion] = []
        eligible: list[tuple[float, float | None, str, str | None]] = []

        for model_id in sorted(evidence_by_model):
            evidence = evidence_by_model[model_id]
            reasons: list[str] = []
            score = _coding_score(evidence)
            if score is None:
                reason = "缺少同版本 AA Coding 证据，不能证明 Python 编程能力。"
                evidence = _with_gap(
                    evidence,
                    EvidenceGap(code=MISSING_BENCHMARK, message=reason, field="aa-coding"),
                )
                reasons.append(reason)

            if constraints.end_user_country is not None:
                reason = (
                    f"仓库没有 {constraints.end_user_country} 最终用户国家可用性的结构化证据；"
                    "provider 部署地区不能替代该结论。"
                )
                evidence = _with_gap(
                    evidence,
                    EvidenceGap(
                        code=MISSING_END_USER_AVAILABILITY,
                        message=reason,
                        field="end_user_country",
                    ),
                )
                reasons.append(reason)

            if constraints.max_latency_ms is not None:
                reason = "仓库没有结构化延迟证据，不能证明满足最大延迟约束。"
                evidence = _with_gap(
                    evidence,
                    EvidenceGap(code=MISSING_LATENCY, message=reason, field="max_latency_ms"),
                )
                reasons.append(reason)

            if constraints.license_policy == LicensePolicy.OFFICIAL_LICENSE_EVIDENCE and not any(
                document.kind == ProviderSourceKind.LICENSE for document in evidence.documents
            ):
                reason = "没有实际命中的 exact-version 官方许可证文档，不能证明许可证约束。"
                evidence = _with_gap(
                    evidence,
                    EvidenceGap(code=MISSING_LICENSE, message=reason, field="license_policy"),
                )
                reasons.append(reason)

            selected_offer_id: str | None = None
            if constraints.monthly_budget is not None:
                available_quotes = [
                    quote
                    for quote in evidence.pricing
                    if quote.status == PriceCalculationStatus.AVAILABLE and quote.monthly_cost is not None
                ]
                within_budget = [
                    quote
                    for quote in available_quotes
                    if quote.monthly_cost is not None
                    and quote.monthly_cost <= Decimal(str(constraints.monthly_budget))
                ]
                if within_budget:
                    selected_offer_id = min(quote.offer_id for quote in within_budget)
                elif available_quotes:
                    reason = "所有具有完整证据的报价都超过月预算。"
                    evidence = _with_gap(
                        evidence,
                        EvidenceGap(code=OVER_BUDGET, message=reason, field="monthly_budget"),
                    )
                    reasons.append(reason)
                else:
                    statuses = {quote.status for quote in evidence.pricing}
                    if PriceCalculationStatus.STALE_EVIDENCE in statuses:
                        code = STALE_PRICING
                        reason = "匹配报价已经超过证据有效截止日，不能证明满足月预算。"
                    elif constraints.cached_input_tokens and evidence.pricing:
                        code = MISSING_CACHE_PRICE
                        reason = "匹配报价缺少缓存输入单价，不能计算完整月成本。"
                    else:
                        code = MISSING_PRICING
                        reason = "缺少匹配地区、币种和请求区间的完整报价证据。"
                    evidence = _with_gap(
                        evidence,
                        EvidenceGap(code=code, message=reason, field="pricing"),
                    )
                    reasons.append(reason)

            verified.append(evidence)
            if reasons or score is None:
                exclusions.append(RecommendationExclusion(model_id=model_id, reasons=tuple(reasons)))
            else:
                eligible.append((score, _intelligence_score(evidence), model_id, selected_offer_id))

        eligible.sort(
            key=lambda item: (
                -item[0],
                item[1] is None,
                -(item[1] or 0),
                item[2],
            )
        )
        if not eligible:
            return Recommendation(
                selected_model_id=None,
                rationale=("现有受控证据不足以证明任何候选满足全部约束。",),
                evidence=tuple(verified),
                exclusions=tuple(exclusions),
            )

        score, _intelligence, selected_model_id, offer_id = eligible[0]
        rationale = [f"{selected_model_id} 的同版本 AA Coding 指数为 {score:g}，在合格候选中最高。"]
        if offer_id is not None:
            rationale.append(f"报价 {offer_id} 在给定单请求用量和月请求数下满足预算。")
        return Recommendation(
            selected_model_id=selected_model_id,
            rationale=tuple(rationale),
            evidence=tuple(verified),
            exclusions=tuple(exclusions),
        )

    @staticmethod
    def gap_codes(evidence: Sequence[ModelEvidence]) -> tuple[str, ...]:
        """Return stable, sorted gap codes for tests and deterministic evaluations."""

        return tuple(sorted({gap.code for item in evidence for gap in item.gaps}))
