"""Pure deterministic selection and evidence-application rules for the advisor."""

from __future__ import annotations

from collections.abc import Iterable
from decimal import Context, Decimal, localcontext
from functools import cmp_to_key

from app.domain.advisor import (
    AaPublicModel,
    AbilityPurpose,
    AdvisorBudget,
    CandidateVerification,
    EvidenceVerdict,
    HardRequirement,
    ParsedAdvisorNeed,
    PromotedObjective,
    RankedAdvisorCandidate,
    VerificationCheckKind,
    VerifiedAdvisorCandidate,
)

VERIFICATION_POOL_SIZE = 5
FINAL_RECOMMENDATION_COUNT = 3
_TOKENS_PER_MILLION = Decimal(1_000_000)
_EXACT_COST_CONTEXT = Context(prec=1_024)


def advisor_name_sort_key(model: AaPublicModel) -> str:
    return model.raw_name or model.source_slug or f"未命名模型 {model.source_id}"


def estimate_monthly_cost(model: AaPublicModel, budget: AdvisorBudget) -> Decimal | None:
    """Calculate exact monthly USD cost, preserving genuine zero prices and tokens."""

    if model.input_price_per_million is None or model.output_price_per_million is None:
        return None
    # Binary64 prices span roughly 10^-324 through 10^308. Combined with three
    # JS-safe integer factors, 1,024 significant digits preserves the complete
    # finite decimal expansion and is independent of the caller's Decimal context.
    with localcontext(_EXACT_COST_CONTEXT):
        input_cost = (
            Decimal(budget.average_input_tokens)
            / _TOKENS_PER_MILLION
            * Decimal(str(model.input_price_per_million))
        )
        output_cost = (
            Decimal(budget.average_output_tokens)
            / _TOKENS_PER_MILLION
            * Decimal(str(model.output_price_per_million))
        )
        return Decimal(budget.monthly_request_count) * (input_cost + output_cost)


def _ability_value(model: AaPublicModel, purpose: AbilityPurpose) -> float | None:
    if purpose == AbilityPurpose.INTELLIGENCE:
        return model.intelligence
    if purpose == AbilityPurpose.CODING:
        return model.coding
    return model.agentic


def _is_eligible(model: AaPublicModel, need: ParsedAdvisorNeed, budget: AdvisorBudget | None) -> bool:
    if any(_ability_value(model, purpose) is None for purpose in need.ability_purposes):
        return False
    if need.promoted_objective == PromotedObjective.FASTEST and model.output_tokens_per_second is None:
        return False
    if need.promoted_objective == PromotedObjective.CHEAPEST and model.output_price_per_million is None:
        return False
    if budget is not None:
        monthly_cost = estimate_monthly_cost(model, budget)
        if monthly_cost is None or monthly_cost > budget.monthly_budget_usd:
            return False
    return True


def _sort_fields(need: ParsedAdvisorNeed) -> tuple[tuple[str, bool], ...]:
    fields: list[tuple[str, bool]] = []
    if need.promoted_objective == PromotedObjective.FASTEST:
        fields.append(("output_tokens_per_second", True))
    elif need.promoted_objective == PromotedObjective.CHEAPEST:
        fields.append(("output_price_per_million", False))

    ability_fields = {
        AbilityPurpose.INTELLIGENCE: "intelligence",
        AbilityPurpose.CODING: "coding",
        AbilityPurpose.AGENTIC: "agentic",
    }
    fields.extend((ability_fields[purpose], True) for purpose in need.ability_purposes)
    if not any(field == "output_price_per_million" for field, _descending in fields):
        fields.append(("output_price_per_million", False))
    if not any(field == "output_tokens_per_second" for field, _descending in fields):
        fields.append(("output_tokens_per_second", True))
    return tuple(fields)


def _compare_nullable_numbers(left: float | None, right: float | None, *, descending: bool) -> int:
    if left is None and right is None:
        return 0
    if left is None:
        return 1
    if right is None:
        return -1
    if left == right:
        return 0
    if descending:
        return -1 if left > right else 1
    return -1 if left < right else 1


def _compare_models(left: AaPublicModel, right: AaPublicModel, need: ParsedAdvisorNeed) -> int:
    for field, descending in _sort_fields(need):
        order = _compare_nullable_numbers(
            getattr(left, field),
            getattr(right, field),
            descending=descending,
        )
        if order:
            return order
    left_name = advisor_name_sort_key(left)
    right_name = advisor_name_sort_key(right)
    if left_name != right_name:
        return -1 if left_name < right_name else 1
    if left.source_id == right.source_id:
        return 0
    return -1 if left.source_id < right.source_id else 1


def select_verification_pool(
    models: Iterable[AaPublicModel],
    need: ParsedAdvisorNeed,
    budget: AdvisorBudget | None = None,
    *,
    limit: int = VERIFICATION_POOL_SIZE,
) -> tuple[RankedAdvisorCandidate, ...]:
    """Return at most five AA-ordered candidates; callers cannot expand the pool."""

    if not 1 <= limit <= VERIFICATION_POOL_SIZE:
        raise ValueError(f"limit must be between 1 and {VERIFICATION_POOL_SIZE}")
    eligible = [model for model in models if _is_eligible(model, need, budget)]
    eligible.sort(key=cmp_to_key(lambda left, right: _compare_models(left, right, need)))
    return tuple(
        RankedAdvisorCandidate(
            candidate_slot=index,
            model=model,
            estimated_monthly_cost_usd=(estimate_monthly_cost(model, budget) if budget is not None else None),
        )
        for index, model in enumerate(eligible[:limit])
    )


def _requested_check_kinds(
    need: ParsedAdvisorNeed,
    deployment_region: str | None,
) -> frozenset[VerificationCheckKind]:
    checks = {VerificationCheckKind.MODEL_IDENTITY}
    checks.update(VerificationCheckKind(requirement.value) for requirement in need.hard_requirements)
    if deployment_region is not None:
        checks.add(VerificationCheckKind.DEPLOYMENT_REGION)
    return frozenset(checks)


def _is_explicit_constraint(
    check: VerificationCheckKind,
    need: ParsedAdvisorNeed,
    deployment_region: str | None,
) -> bool:
    if check == VerificationCheckKind.DEPLOYMENT_REGION:
        return deployment_region is not None
    if check == VerificationCheckKind.MODEL_IDENTITY:
        return False
    return HardRequirement(check.value) in need.hard_requirements


def apply_verification(
    pool: Iterable[RankedAdvisorCandidate],
    verifications: Iterable[CandidateVerification],
    need: ParsedAdvisorNeed,
    deployment_region: str | None = None,
) -> tuple[VerifiedAdvisorCandidate, ...]:
    """Preserve AA order and remove only officially contradicted explicit constraints."""

    candidates = tuple(pool)
    by_slot: dict[int, CandidateVerification] = {}
    allowed_checks = _requested_check_kinds(need, deployment_region)
    for verification in verifications:
        if verification.candidate_slot in by_slot:
            raise ValueError("candidate verification slots must be unique")
        if verification.candidate_slot >= len(candidates):
            raise ValueError("candidate verification references a slot outside the server-owned pool")
        unexpected_checks = {check.check for check in verification.checks}.difference(allowed_checks)
        if unexpected_checks:
            raise ValueError("candidate verification contains an unrequested check")
        by_slot[verification.candidate_slot] = verification

    survivors: list[VerifiedAdvisorCandidate] = []
    for candidate in candidates:
        candidate_verification = by_slot.get(candidate.candidate_slot)
        identity_confirmed = candidate_verification is not None and any(
            check.check == VerificationCheckKind.MODEL_IDENTITY
            and check.verdict == EvidenceVerdict.SATISFIED
            and bool(check.citation_ids)
            for check in candidate_verification.checks
        )
        contradicted = identity_confirmed and candidate_verification is not None and any(
            check.verdict == EvidenceVerdict.CONTRADICTED
            and _is_explicit_constraint(check.check, need, deployment_region)
            for check in candidate_verification.checks
        )
        if not contradicted:
            survivors.append(VerifiedAdvisorCandidate(candidate=candidate, verification=candidate_verification))
    return tuple(survivors)
