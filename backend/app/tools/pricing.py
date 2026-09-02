"""Evidence-bounded pricing calculations using exact decimal arithmetic."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from app.domain.errors import RepositoryLookupError, ToolErrorCode, ToolName, ToolResult
from app.domain.models import (
    Citation,
    GetModelPricingInput,
    ModelPricingData,
    PriceCalculationStatus,
    PricingQuote,
    PricingTier,
    ProviderSourceKind,
)
from app.repositories.leaderboard import LeaderboardRepository, pricing_evidence_cutoff
from app.tools._common import failure_result, success_result

_TOKENS_PER_MILLION = Decimal(1_000_000)


def _tier_for_input(tiers: tuple[PricingTier, ...], total_input_tokens: int) -> PricingTier | None:
    for tier in tiers:
        maximum = tier.max_input_tokens_inclusive
        if tier.min_input_tokens_exclusive < total_input_tokens and (
            maximum is None or total_input_tokens <= maximum
        ):
            return tier
    return None


def _pricing_citation(tier: PricingTier) -> Citation:
    return Citation(
        citation_id=f"pricing:{tier.offer_id}",
        title=f"Official pricing for {tier.provider_model_id} ({tier.region_id.value})",
        url=tier.source_url,
        observed_at=tier.observed_at,
        provider_id=tier.provider_id,
        provider_model_id=tier.provider_model_id,
        kind=ProviderSourceKind.PRICING,
    )


def get_model_pricing(
    request: GetModelPricingInput,
    *,
    repository: LeaderboardRepository,
) -> ToolResult[ModelPricingData]:
    """Quote every matching offer without inferring regions, tiers, or cache prices."""

    try:
        tiers = repository.get_pricing_tiers(
            request.model_id,
            region_id=request.region_id,
            currency=request.currency,
            provider_id=request.provider_id,
        )
    except RepositoryLookupError as exc:
        return failure_result(
            ToolName.GET_MODEL_PRICING,
            ToolErrorCode.UNKNOWN_MODEL,
            str(exc),
            details={"modelId": request.model_id},
        )

    empty_data = ModelPricingData(model_id=request.model_id, quotes=())
    if not tiers:
        return failure_result(
            ToolName.GET_MODEL_PRICING,
            ToolErrorCode.MISSING_EVIDENCE,
            "No observed provider deployment offer matches the requested region and currency.",
            details={
                "reason": "region_not_observed",
                "regionId": request.region_id.value,
                "currency": request.currency.value,
            },
            data=empty_data,
        )

    tiers_by_offer: dict[str, list[PricingTier]] = defaultdict(list)
    for tier in tiers:
        tiers_by_offer[tier.offer_id].append(tier)

    total_input_tokens = request.input_tokens + request.cached_input_tokens
    quotes: list[PricingQuote] = []
    citations_by_id: dict[str, Citation] = {}
    for offer_id in sorted(tiers_by_offer):
        offer_tiers = tuple(
            sorted(
                tiers_by_offer[offer_id],
                key=lambda item: (
                    item.min_input_tokens_exclusive,
                    item.max_input_tokens_inclusive is None,
                    item.max_input_tokens_inclusive or 0,
                ),
            )
        )
        representative = offer_tiers[0]
        selected_tier = _tier_for_input(offer_tiers, total_input_tokens)
        if selected_tier is None:
            quote = PricingQuote(
                offer_id=representative.offer_id,
                provider_id=representative.provider_id,
                provider_model_id=representative.provider_model_id,
                region_id=representative.region_id,
                currency=representative.currency,
                tier=None,
                request_input_tokens=total_input_tokens,
                per_request_cost=None,
                monthly_cost=None,
                evidence_cutoff=None,
                status=PriceCalculationStatus.MISSING_EVIDENCE,
                reason="request_size_tier_missing",
            )
            citations_by_id[_pricing_citation(representative).citation_id] = _pricing_citation(representative)
            quotes.append(quote)
            continue

        cutoff = pricing_evidence_cutoff(selected_tier)
        citation = _pricing_citation(selected_tier)
        citations_by_id[citation.citation_id] = citation
        if request.as_of < selected_tier.observed_at:
            quote = PricingQuote(
                offer_id=selected_tier.offer_id,
                provider_id=selected_tier.provider_id,
                provider_model_id=selected_tier.provider_model_id,
                region_id=selected_tier.region_id,
                currency=selected_tier.currency,
                tier=selected_tier,
                request_input_tokens=total_input_tokens,
                per_request_cost=None,
                monthly_cost=None,
                evidence_cutoff=cutoff,
                status=PriceCalculationStatus.MISSING_EVIDENCE,
                reason="evidence_not_yet_observed",
            )
        elif request.as_of > cutoff:
            quote = PricingQuote(
                offer_id=selected_tier.offer_id,
                provider_id=selected_tier.provider_id,
                provider_model_id=selected_tier.provider_model_id,
                region_id=selected_tier.region_id,
                currency=selected_tier.currency,
                tier=selected_tier,
                request_input_tokens=total_input_tokens,
                per_request_cost=None,
                monthly_cost=None,
                evidence_cutoff=cutoff,
                status=PriceCalculationStatus.STALE_EVIDENCE,
                reason="pricing_evidence_stale",
            )
        elif request.cached_input_tokens and selected_tier.cached_input_price is None:
            quote = PricingQuote(
                offer_id=selected_tier.offer_id,
                provider_id=selected_tier.provider_id,
                provider_model_id=selected_tier.provider_model_id,
                region_id=selected_tier.region_id,
                currency=selected_tier.currency,
                tier=selected_tier,
                request_input_tokens=total_input_tokens,
                per_request_cost=None,
                monthly_cost=None,
                evidence_cutoff=cutoff,
                status=PriceCalculationStatus.MISSING_EVIDENCE,
                reason="cached_input_price_missing",
            )
        else:
            cached_input_price = selected_tier.cached_input_price or Decimal(0)
            per_request_cost = (
                Decimal(request.input_tokens) * selected_tier.input_price
                + Decimal(request.cached_input_tokens) * cached_input_price
                + Decimal(request.output_tokens) * selected_tier.output_price
            ) / _TOKENS_PER_MILLION
            quote = PricingQuote(
                offer_id=selected_tier.offer_id,
                provider_id=selected_tier.provider_id,
                provider_model_id=selected_tier.provider_model_id,
                region_id=selected_tier.region_id,
                currency=selected_tier.currency,
                tier=selected_tier,
                request_input_tokens=total_input_tokens,
                per_request_cost=per_request_cost,
                monthly_cost=per_request_cost * Decimal(request.monthly_request_count),
                evidence_cutoff=cutoff,
                status=PriceCalculationStatus.AVAILABLE,
            )
        quotes.append(quote)

    data = ModelPricingData(model_id=request.model_id, quotes=tuple(quotes))
    citations = tuple(citations_by_id[key] for key in sorted(citations_by_id))
    observed_at = max(tier.observed_at for tier in tiers)
    if any(quote.status == PriceCalculationStatus.AVAILABLE for quote in quotes):
        return success_result(data, citations=citations, observed_at=observed_at)
    if all(quote.status == PriceCalculationStatus.STALE_EVIDENCE for quote in quotes):
        return failure_result(
            ToolName.GET_MODEL_PRICING,
            ToolErrorCode.STALE_EVIDENCE,
            "All matching pricing evidence is stale for the requested date.",
            details={"reason": "pricing_evidence_stale"},
            data=data,
            citations=citations,
            observed_at=observed_at,
        )
    return failure_result(
        ToolName.GET_MODEL_PRICING,
        ToolErrorCode.MISSING_EVIDENCE,
        "Matching offers exist, but the evidence is insufficient for a price calculation.",
        details={"reason": "price_calculation_missing_evidence"},
        data=data,
        citations=citations,
        observed_at=observed_at,
    )
