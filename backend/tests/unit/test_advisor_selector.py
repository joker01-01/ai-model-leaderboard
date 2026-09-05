from __future__ import annotations

from datetime import date
from decimal import Decimal, localcontext
from sys import float_info

import pytest

from app.domain.advisor import (
    AaPublicModel,
    AbilityPurpose,
    AdvisorBudget,
    CandidateEvidenceCheck,
    CandidateVerification,
    EvidenceVerdict,
    HardRequirement,
    OfficialCitation,
    OfficialSourceKind,
    ParsedAdvisorNeed,
    PromotedObjective,
    VerificationCheckKind,
)
from app.services.advisor_selector import (
    apply_verification,
    estimate_monthly_cost,
    select_verification_pool,
)


def _model(source_id: str, **overrides: object) -> AaPublicModel:
    values: dict[str, object] = {
        "source_id": source_id,
        "source_slug": f"slug-{source_id}",
        "raw_name": f"Model {source_id}",
        "creator_id": "creator-a",
        "creator_name": "Creator A",
        "release_date": date(2026, 1, 1),
        "observed_at": date(2026, 9, 4),
        "intelligence": 50.0,
        "coding": 50.0,
        "agentic": 50.0,
        "input_price_per_million": 1.0,
        "output_price_per_million": 2.0,
        "time_to_first_answer_seconds": 1.0,
        "output_tokens_per_second": 100.0,
    }
    values.update(overrides)
    return AaPublicModel.model_validate(values)


def _need(
    *purposes: AbilityPurpose,
    objective: PromotedObjective | None = None,
    hard: tuple[HardRequirement, ...] = (),
) -> ParsedAdvisorNeed:
    return ParsedAdvisorNeed(
        ability_purposes=purposes or (AbilityPurpose.INTELLIGENCE,),
        promoted_objective=objective,
        hard_requirements=hard,
    )


def _budget(amount: str) -> AdvisorBudget:
    return AdvisorBudget(
        monthly_budget_usd=Decimal(amount),
        average_input_tokens=1_000_000,
        average_output_tokens=1_000_000,
        monthly_request_count=1,
    )


def test_applies_default_and_promoted_sort_keys_without_duplication() -> None:
    models = (
        _model("strong", intelligence=90.0, output_price_per_million=9.0, output_tokens_per_second=20.0),
        _model("fast", intelligence=80.0, output_price_per_million=5.0, output_tokens_per_second=300.0),
        _model("cheap", intelligence=70.0, output_price_per_million=0.0, output_tokens_per_second=10.0),
    )

    assert [item.model.source_id for item in select_verification_pool(models, _need())] == [
        "strong",
        "fast",
        "cheap",
    ]
    assert [
        item.model.source_id
        for item in select_verification_pool(models, _need(objective=PromotedObjective.FASTEST))
    ] == ["fast", "strong", "cheap"]
    assert [
        item.model.source_id
        for item in select_verification_pool(models, _need(objective=PromotedObjective.CHEAPEST))
    ] == ["cheap", "fast", "strong"]


def test_preserves_ordered_ability_tuple_and_missing_last_rules() -> None:
    models = (
        _model("intelligence-first", intelligence=90.0, coding=60.0, output_price_per_million=None),
        _model("coding-first", intelligence=80.0, coding=95.0, output_price_per_million=1.0),
        _model("missing-required", intelligence=100.0, coding=None),
    )

    intelligence_first = select_verification_pool(
        models,
        _need(AbilityPurpose.INTELLIGENCE, AbilityPurpose.CODING),
    )
    coding_first = select_verification_pool(
        models,
        _need(AbilityPurpose.CODING, AbilityPurpose.INTELLIGENCE),
    )

    assert [item.model.source_id for item in intelligence_first] == ["intelligence-first", "coding-first"]
    assert [item.model.source_id for item in coding_first] == ["coding-first", "intelligence-first"]


def test_budget_uses_exact_decimal_formula_inclusive_boundary_and_real_zero() -> None:
    exact = _model("exact", input_price_per_million=0.1, output_price_per_million=0.2)
    free = _model("free", input_price_per_million=0.0, output_price_per_million=0.0, intelligence=40.0)
    missing = _model("missing", input_price_per_million=None, intelligence=99.0)

    assert estimate_monthly_cost(exact, _budget("0.3")) == Decimal("0.3")
    selected = select_verification_pool((missing, exact, free), _need(), _budget("0.3"))

    assert [item.model.source_id for item in selected] == ["exact", "free"]
    assert selected[1].estimated_monthly_cost_usd == Decimal("0.0")


def test_monthly_cost_is_exact_for_max_safe_integers_independent_of_ambient_precision() -> None:
    maximum_safe_integer = 9_007_199_254_740_991
    model = _model(
        "precision-boundary",
        input_price_per_million=1.2345678901234567,
        output_price_per_million=9.876543210987654,
    )
    budget = AdvisorBudget(
        monthly_budget_usd=Decimal("9" * 128),
        average_input_tokens=maximum_safe_integer,
        average_output_tokens=maximum_safe_integer,
        monthly_request_count=maximum_safe_integer,
    )
    with localcontext() as context:
        context.prec = 1_024
        expected = (
            Decimal(maximum_safe_integer)
            * Decimal(maximum_safe_integer)
            * (Decimal("1.2345678901234567") + Decimal("9.876543210987654"))
            / Decimal(1_000_000)
        )
    with localcontext() as context:
        context.prec = 6
        actual = estimate_monthly_cost(model, budget)

    assert actual == expected
    assert actual is not None
    assert len(actual.as_tuple().digits) > 28


def test_monthly_cost_preserves_the_full_finite_float_exponent_range() -> None:
    maximum_safe_integer = 9_007_199_254_740_991
    model = _model(
        "float-exponents",
        input_price_per_million=float_info.max,
        output_price_per_million=5e-324,
    )
    budget = AdvisorBudget(
        monthly_budget_usd=Decimal("9e999"),
        average_input_tokens=maximum_safe_integer,
        average_output_tokens=maximum_safe_integer,
        monthly_request_count=maximum_safe_integer,
    )
    with localcontext() as context:
        context.prec = 1_024
        expected = (
            Decimal(maximum_safe_integer)
            * Decimal(maximum_safe_integer)
            * (Decimal(str(float_info.max)) + Decimal("5e-324"))
            / Decimal(1_000_000)
        )
    with localcontext() as context:
        context.prec = 6
        actual = estimate_monthly_cost(model, budget)

    assert actual == expected
    assert actual is not None
    assert len(actual.as_tuple().digits) > 600


def test_extremely_small_cost_remains_exact_in_the_ranked_candidate() -> None:
    model = _model(
        "small-cost",
        input_price_per_million=5e-324,
        output_price_per_million=0.0,
    )
    budget = AdvisorBudget(
        monthly_budget_usd=Decimal("1e-126"),
        average_input_tokens=1,
        average_output_tokens=0,
        monthly_request_count=1,
    )

    exact = estimate_monthly_cost(model, budget)
    (selected,) = select_verification_pool((model,), _need(), budget)

    assert exact == Decimal("5e-330")
    assert selected.estimated_monthly_cost_usd == Decimal("5e-330")
    assert selected.estimated_monthly_cost_usd is not None
    rendered = format(selected.estimated_monthly_cost_usd, "f")
    assert len(rendered) == 332


def test_fastest_and_cheapest_require_their_primary_metric() -> None:
    missing_speed = _model("missing-speed", intelligence=99.0, output_tokens_per_second=None)
    missing_price = _model("missing-price", intelligence=98.0, output_price_per_million=None)
    complete = _model("complete", intelligence=50.0)

    fastest = select_verification_pool(
        (missing_speed, missing_price, complete),
        _need(objective=PromotedObjective.FASTEST),
    )
    cheapest = select_verification_pool(
        (missing_speed, missing_price, complete),
        _need(objective=PromotedObjective.CHEAPEST),
    )

    assert [item.model.source_id for item in fastest] == ["missing-price", "complete"]
    assert [item.model.source_id for item in cheapest] == ["missing-speed", "complete"]


def test_stabilizes_ties_by_unicode_name_then_source_id_and_never_exceeds_five() -> None:
    models = tuple(
        _model(
            source_id,
            raw_name=name,
            source_slug=None,
        )
        for source_id, name in [
            ("z", "B"),
            ("b", "A"),
            ("a", "A"),
            ("c", "C"),
            ("d", "D"),
            ("e", "E"),
        ]
    )

    selected = select_verification_pool(models, _need())

    assert [item.model.source_id for item in selected] == ["a", "b", "z", "c", "d"]
    assert [item.candidate_slot for item in selected] == [0, 1, 2, 3, 4]
    with pytest.raises(ValueError, match="between 1 and 5"):
        select_verification_pool(models, _need(), limit=6)


def _citation(citation_id: str) -> OfficialCitation:
    return OfficialCitation(
        citation_id=citation_id,
        title="Official evidence",
        url="https://creator.example/evidence",
        source_kind=OfficialSourceKind.OFFICIAL_SITE,
        creator_id="creator-a",
    )


def _check(
    kind: VerificationCheckKind,
    verdict: EvidenceVerdict,
    citation_id: str,
) -> CandidateEvidenceCheck:
    return CandidateEvidenceCheck(
        check=kind,
        verdict=verdict,
        summary="Reviewed evidence",
        citation_ids=(citation_id,),
    )


def test_verification_removes_only_explicitly_contradicted_constraints_without_reordering() -> None:
    need = _need(hard=(HardRequirement.API_ACCESS,))
    pool = select_verification_pool((_model("a", intelligence=70.0), _model("b", intelligence=60.0)), need)
    identity_citation = _citation("identity")
    hard_citation = _citation("api")
    verifications = (
        CandidateVerification(
            candidate_slot=0,
            checks=(
                _check(VerificationCheckKind.MODEL_IDENTITY, EvidenceVerdict.CONTRADICTED, "identity"),
            ),
            citations=(identity_citation,),
        ),
        CandidateVerification(
            candidate_slot=1,
            checks=(
                _check(VerificationCheckKind.MODEL_IDENTITY, EvidenceVerdict.SATISFIED, "identity"),
                _check(VerificationCheckKind.API_ACCESS, EvidenceVerdict.CONTRADICTED, "api"),
            ),
            citations=(identity_citation, hard_citation),
        ),
    )

    survivors = apply_verification(pool, verifications, need)

    assert [item.candidate.model.source_id for item in survivors] == ["a"]


def test_contradiction_does_not_remove_a_candidate_without_confirmed_identity() -> None:
    need = _need(hard=(HardRequirement.API_ACCESS,))
    pool = select_verification_pool((_model("a", intelligence=70.0),), need)
    hard_citation = _citation("api")
    verification = CandidateVerification(
        candidate_slot=0,
        checks=(
            CandidateEvidenceCheck(
                check=VerificationCheckKind.MODEL_IDENTITY,
                verdict=EvidenceVerdict.UNVERIFIED,
            ),
            _check(VerificationCheckKind.API_ACCESS, EvidenceVerdict.CONTRADICTED, "api"),
        ),
        citations=(hard_citation,),
    )

    survivors = apply_verification(pool, (verification,), need)

    assert [item.candidate.model.source_id for item in survivors] == ["a"]


def test_missing_region_evidence_is_not_a_contradiction_and_no_sixth_candidate_is_added() -> None:
    need = _need()
    pool = select_verification_pool(tuple(_model(str(index), intelligence=100.0 - index) for index in range(6)), need)
    verification = CandidateVerification(
        candidate_slot=0,
        checks=(
            CandidateEvidenceCheck(
                check=VerificationCheckKind.MODEL_IDENTITY,
                verdict=EvidenceVerdict.UNVERIFIED,
            ),
            CandidateEvidenceCheck(
                check=VerificationCheckKind.DEPLOYMENT_REGION,
                verdict=EvidenceVerdict.UNVERIFIED,
            ),
        ),
    )

    survivors = apply_verification(pool, (verification,), need, deployment_region="中国大陆")

    assert [item.candidate.model.source_id for item in survivors] == ["0", "1", "2", "3", "4"]
    with pytest.raises(ValueError, match="unrequested check"):
        apply_verification(pool, (verification,), need)
