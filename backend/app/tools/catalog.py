"""Deterministic catalog pre-filtering for the recommendation graph."""

from __future__ import annotations

from app.domain.errors import RepositoryLookupError, ToolErrorCode, ToolName, ToolResult
from app.domain.models import (
    BenchmarkId,
    CandidateDecision,
    LicensePolicy,
    ListModelsData,
    ListModelsInput,
    ModelCandidate,
    ProviderSourceKind,
)
from app.repositories.leaderboard import LeaderboardRepository
from app.tools._common import failure_result, success_result


def list_models(
    request: ListModelsInput,
    *,
    repository: LeaderboardRepository,
) -> ToolResult[ListModelsData]:
    """Return the exact verifier candidate set plus every pre-filter decision."""

    try:
        models = repository.list_models(request.candidate_model_ids)
    except RepositoryLookupError:
        return failure_result(
            ToolName.LIST_MODELS,
            ToolErrorCode.UNKNOWN_MODEL,
            "One or more candidate model IDs are unknown.",
            details={"candidateModelIds": request.candidate_model_ids or ()},
        )

    candidates: list[ModelCandidate] = []
    decisions: list[CandidateDecision] = []
    for model in sorted(models, key=lambda item: item.id):
        reasons: list[str] = []
        coding = repository.get_benchmark_observations(model.id, (BenchmarkId.AA_CODING,))
        if not coding:
            reasons.append("missing_evidence:aa-coding")

        if request.provider_region_id is not None or request.currency is not None:
            offers = repository.get_pricing_tiers(
                model.id,
                region_id=request.provider_region_id,
                currency=request.currency,
            )
            if not offers:
                reasons.append("missing_evidence:provider_deployment_offer")

        if request.open_weights_required and not model.open:
            reasons.append("constraint_not_satisfied:open_weights")

        if request.license_policy == LicensePolicy.OFFICIAL_LICENSE_EVIDENCE:
            license_sources = repository.get_provider_sources(model.id, (ProviderSourceKind.LICENSE,))
            if not license_sources:
                reasons.append("missing_evidence:official_license")

        included = not reasons
        decisions.append(
            CandidateDecision(
                model_id=model.id,
                included=included,
                reasons=tuple(reasons),
            )
        )
        if included:
            candidates.append(
                ModelCandidate(
                    model_id=model.id,
                    name=model.name,
                    maker=model.maker,
                    open=model.open,
                    license=model.license,
                )
            )

    return success_result(
        ListModelsData(candidates=tuple(candidates), filter_decisions=tuple(decisions)),
        observed_at=repository.catalog.data_date,
    )
