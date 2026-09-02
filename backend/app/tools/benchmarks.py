"""Read-only benchmark evidence lookup."""

from __future__ import annotations

from app.domain.errors import RepositoryLookupError, ToolErrorCode, ToolName, ToolResult
from app.domain.models import Citation, GetModelBenchmarksInput, ModelBenchmarksData
from app.repositories.leaderboard import LeaderboardRepository
from app.tools._common import failure_result, success_result


def get_model_benchmarks(
    request: GetModelBenchmarksInput,
    *,
    repository: LeaderboardRepository,
) -> ToolResult[ModelBenchmarksData]:
    """Return every exact observation found and explicitly retain partial gaps."""

    try:
        observations = repository.get_benchmark_observations(request.model_id, request.benchmark_ids)
    except RepositoryLookupError as exc:
        return failure_result(
            ToolName.GET_MODEL_BENCHMARKS,
            ToolErrorCode.UNKNOWN_MODEL,
            str(exc),
            details={"modelId": request.model_id},
        )

    ordered = tuple(sorted(observations, key=lambda item: item.benchmark_id.value))
    found = {observation.benchmark_id for observation in ordered}
    missing = tuple(sorted(set(request.benchmark_ids).difference(found), key=lambda item: item.value))
    citations = tuple(
        Citation(
            citation_id=f"benchmark:{observation.model_id}:{observation.benchmark_id.value}",
            title=observation.definition.source_label,
            url=observation.definition.source_url,
            observed_at=observation.observed_at,
        )
        for observation in ordered
    )
    data = ModelBenchmarksData(
        model_id=request.model_id,
        observations=ordered,
        missing_benchmark_ids=missing,
    )
    observed_at = max((observation.observed_at for observation in ordered), default=None)
    return success_result(data, citations=citations, observed_at=observed_at)
