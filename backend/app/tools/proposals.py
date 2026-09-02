"""Pure, deterministic proposal construction for human-reviewed updates."""

from __future__ import annotations

import hashlib
import json

from app.domain.errors import RepositoryLookupError, ToolErrorCode, ToolName, ToolResult
from app.domain.models import (
    BenchmarkId,
    Citation,
    PrepareDataUpdateInput,
    ProposalAction,
    ProposalChange,
    ProposalRisk,
    ProposalStatus,
    ProposedBenchmarkObservation,
    UpdateProposal,
)
from app.repositories.leaderboard import LeaderboardRepository
from app.tools._common import failure_result, success_result

_AA_BENCHMARKS = frozenset((BenchmarkId.AA_CODING, BenchmarkId.AA_INTELLIGENCE))


def _canonical_payload(
    *,
    model_id: str,
    reason: str,
    changes: tuple[ProposalChange, ...],
    citations: tuple[Citation, ...],
    risks: tuple[ProposalRisk, ...],
) -> str:
    payload = {
        "status": ProposalStatus.AWAITING_HUMAN_REVIEW.value,
        "modelId": model_id,
        "reason": reason,
        "changes": [change.model_dump(mode="json", by_alias=True) for change in changes],
        "citations": [citation.model_dump(mode="json", by_alias=True) for citation in citations],
        "risks": [risk.model_dump(mode="json", by_alias=True) for risk in risks],
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _normalized_observation(observation: ProposedBenchmarkObservation) -> ProposedBenchmarkObservation:
    return observation.model_copy(update={"citation_ids": tuple(sorted(observation.citation_ids))})


def prepare_data_update(
    request: PrepareDataUpdateInput,
    *,
    repository: LeaderboardRepository,
) -> ToolResult[UpdateProposal]:
    """Build a content-addressed proposal without touching files or external state."""

    try:
        repository.require_model(request.model_id)
        aliases = repository.get_aliases(request.model_id)
    except RepositoryLookupError as exc:
        return failure_result(
            ToolName.PREPARE_DATA_UPDATE,
            ToolErrorCode.UNKNOWN_MODEL,
            str(exc),
            details={"modelId": request.model_id},
        )

    benchmark_ids = [observation.benchmark_id for observation in request.proposed_observations]
    if len(benchmark_ids) != len(set(benchmark_ids)):
        return failure_result(
            ToolName.PREPARE_DATA_UPDATE,
            ToolErrorCode.INVALID_ARGUMENTS,
            "A proposal may contain only one observation per benchmark.",
            details={"reason": "duplicate_benchmark_observation"},
        )

    citations = tuple(sorted(request.citations, key=lambda item: item.citation_id))
    citations_by_id = {citation.citation_id: citation for citation in citations}
    registered_provider_bindings = {
        (binding.provider_id, binding.provider_model_id)
        for binding in aliases.provider_models
    }
    for citation in citations:
        if citation.provider_id is None:
            continue
        provider_binding = (citation.provider_id, citation.provider_model_id)
        if provider_binding not in registered_provider_bindings:
            return failure_result(
                ToolName.PREPARE_DATA_UPDATE,
                ToolErrorCode.CONFLICTING_EVIDENCE,
                "A provider citation is not bound to the target model's approved exact provider version.",
                details={
                    "reason": "citation_provider_binding_mismatch",
                    "citationId": citation.citation_id,
                    "providerId": citation.provider_id.value,
                    "providerModelId": citation.provider_model_id,
                },
            )
    referenced_citation_ids = {
        citation_id
        for observation in request.proposed_observations
        for citation_id in observation.citation_ids
    }
    missing_citation_ids = tuple(sorted(referenced_citation_ids.difference(citations_by_id)))
    if missing_citation_ids:
        return failure_result(
            ToolName.PREPARE_DATA_UPDATE,
            ToolErrorCode.MISSING_EVIDENCE,
            "The proposal references citations that were not supplied.",
            details={"reason": "citation_missing", "citationIds": missing_citation_ids},
        )

    definitions = {
        definition.id: definition
        for definition in repository.get_benchmark_definitions(benchmark_ids)
    }
    observations = {
        observation.benchmark_id: observation
        for observation in repository.get_benchmark_observations(request.model_id, benchmark_ids)
    }
    normalized = tuple(
        sorted(
            (_normalized_observation(observation) for observation in request.proposed_observations),
            key=lambda item: item.benchmark_id.value,
        )
    )
    changes: list[ProposalChange] = []
    risks: list[ProposalRisk] = []
    for after in normalized:
        definition = definitions.get(after.benchmark_id)
        if definition is None:
            return failure_result(
                ToolName.PREPARE_DATA_UPDATE,
                ToolErrorCode.MISSING_EVIDENCE,
                "The benchmark definition required by the proposal is missing.",
                details={"reason": "benchmark_definition_missing", "benchmarkId": after.benchmark_id.value},
            )
        if after.unit != definition.unit:
            return failure_result(
                ToolName.PREPARE_DATA_UPDATE,
                ToolErrorCode.CONFLICTING_EVIDENCE,
                "The proposed unit conflicts with the benchmark definition.",
                details={"reason": "benchmark_unit_mismatch", "benchmarkId": after.benchmark_id.value},
            )
        if not definition.calibration.min <= after.value <= definition.calibration.max:
            return failure_result(
                ToolName.PREPARE_DATA_UPDATE,
                ToolErrorCode.CONFLICTING_EVIDENCE,
                "The proposed value falls outside the benchmark calibration bounds.",
                details={
                    "reason": "benchmark_value_out_of_range",
                    "benchmarkId": after.benchmark_id.value,
                    "calibrationMin": definition.calibration.min,
                    "calibrationMax": definition.calibration.max,
                },
            )

        if after.benchmark_id in _AA_BENCHMARKS:
            exact_version = after.source_version_id in aliases.aa_slugs
        else:
            exact_version = (
                after.source_version_id in aliases.benchmark_version_ids
                and after.model_version in aliases.benchmark_version_ids
                and after.source_version_id == after.model_version
            )
        if not exact_version:
            return failure_result(
                ToolName.PREPARE_DATA_UPDATE,
                ToolErrorCode.CONFLICTING_EVIDENCE,
                "The proposed observation is not bound to an approved exact model version.",
                details={"reason": "exact_version_mismatch", "benchmarkId": after.benchmark_id.value},
            )

        before = observations.get(after.benchmark_id)
        action = ProposalAction.ADD if before is None else ProposalAction.REPLACE
        changes.append(
            ProposalChange(
                action=action,
                benchmark_id=after.benchmark_id,
                before=before,
                after=after,
            )
        )
        path = f"benchmarkObservations.{after.benchmark_id.value}"
        if before is None:
            risks.append(
                ProposalRisk(
                    code="new_observation",
                    message="The proposal adds a previously missing benchmark observation.",
                    path=path,
                )
            )
        else:
            if after.value != before.value:
                risks.append(
                    ProposalRisk(
                        code="benchmark_value_change",
                        message=f"The benchmark value changes from {before.value} to {after.value}.",
                        path=path,
                    )
                )
            if after.model_version != before.model_version:
                risks.append(
                    ProposalRisk(
                        code="model_version_change",
                        message="The concrete model version differs from the current observation.",
                        path=path,
                    )
                )
            if after.observed_at < before.observed_at:
                risks.append(
                    ProposalRisk(
                        code="older_observation",
                        message="The proposed observation predates the current observation.",
                        path=path,
                    )
                )

    ordered_changes = tuple(changes)
    ordered_risks = tuple(sorted(risks, key=lambda item: (item.path or "", item.code)))
    canonical = _canonical_payload(
        model_id=request.model_id,
        reason=request.reason,
        changes=ordered_changes,
        citations=citations,
        risks=ordered_risks,
    )
    proposal_id = f"proposal-{hashlib.sha256(canonical.encode('utf-8')).hexdigest()}"
    proposal = UpdateProposal(
        proposal_id=proposal_id,
        status=ProposalStatus.AWAITING_HUMAN_REVIEW,
        model_id=request.model_id,
        reason=request.reason,
        changes=ordered_changes,
        citations=citations,
        risks=ordered_risks,
    )
    observed_at = max(observation.observed_at for observation in normalized)
    return success_result(proposal, citations=citations, observed_at=observed_at)
