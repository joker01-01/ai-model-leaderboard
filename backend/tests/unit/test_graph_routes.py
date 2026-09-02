"""Focused route, terminal-state, and deterministic-ranking tests."""

from __future__ import annotations

import asyncio
from pathlib import Path

from app.domain.models import (
    AgentIntent,
    BenchmarkId,
    CandidateDecision,
    ModelEvidence,
    ModelTask,
    RunStatus,
    SelectionConstraints,
)
from app.graph.routes import (
    route_after_candidates,
    route_after_evidence,
    route_after_parse,
    route_after_rank_inspection,
    route_from_intent,
)
from app.graph.state import AgentState
from app.repositories.leaderboard import LeaderboardRepository
from app.services.evidence_verifier import EvidenceVerifier
from evals.run import load_cases, run_cases


def test_routes_are_pure_and_cover_every_intent() -> None:
    assert route_after_parse(AgentState(status=RunStatus.FAILED)) == "finalize"
    assert route_after_parse(AgentState(missing_constraints=("currency",))) == "clarify"
    assert route_after_parse(AgentState(status=RunStatus.RUNNING)) == "route_intent"

    assert route_from_intent(AgentState(intent=AgentIntent.RECOMMEND)) == "load_candidates"
    assert route_from_intent(AgentState(intent=AgentIntent.EXPLAIN_UNRANKED)) == "inspect_rank_status"
    assert route_from_intent(AgentState(intent=AgentIntent.PREPARE_UPDATE)) == "inspect_update_input"
    assert route_from_intent(AgentState()) == "finalize"

    assert route_after_candidates(AgentState(candidate_model_ids=("qwen-3-5",))) == "collect_evidence"
    assert route_after_candidates(
        AgentState(
            candidate_model_ids=(),
            filter_decisions=(CandidateDecision(model_id="qwen-3-5", included=False, reasons=("excluded",)),),
        )
    ) == "collect_evidence"
    assert route_after_candidates(AgentState(candidate_model_ids=())) == "finalize"
    assert route_after_evidence(AgentState(status=RunStatus.FAILED)) == "finalize"
    assert route_after_evidence(AgentState(status=RunStatus.RUNNING)) == "verify_evidence"
    assert route_after_rank_inspection(AgentState(status=RunStatus.FAILED)) == "finalize"
    assert route_after_rank_inspection(AgentState(status=RunStatus.RUNNING)) == "explain_unranked"


def test_recommendation_tie_breaks_by_intelligence_then_model_id() -> None:
    repository = LeaderboardRepository.load()
    observations = {
        observation.benchmark_id: observation
        for observation in repository.get_benchmark_observations(
            "qwen-3-5",
            (BenchmarkId.AA_CODING, BenchmarkId.AA_INTELLIGENCE),
        )
    }
    coding = observations[BenchmarkId.AA_CODING]
    intelligence = observations[BenchmarkId.AA_INTELLIGENCE]

    higher_intelligence = ModelEvidence(
        model_id="model-b",
        benchmarks=(
            coding.model_copy(update={"model_id": "model-b", "value": 50.0}),
            intelligence.model_copy(update={"model_id": "model-b", "value": 60.0}),
        ),
    )
    lower_intelligence = ModelEvidence(
        model_id="model-a",
        benchmarks=(
            coding.model_copy(update={"model_id": "model-a", "value": 50.0}),
            intelligence.model_copy(update={"model_id": "model-a", "value": 55.0}),
        ),
    )
    verifier = EvidenceVerifier()
    constraints = SelectionConstraints(task=ModelTask.PYTHON_CODING)

    recommendation = verifier.recommend(
        constraints,
        {"model-a": lower_intelligence, "model-b": higher_intelligence},
    )
    assert recommendation.selected_model_id == "model-b"

    equal_intelligence = higher_intelligence.model_copy(
        update={
            "model_id": "model-a",
            "benchmarks": tuple(
                observation.model_copy(update={"model_id": "model-a"})
                for observation in higher_intelligence.benchmarks
            ),
        }
    )
    recommendation = verifier.recommend(
        constraints,
        {"model-b": higher_intelligence, "model-a": equal_intelligence},
    )
    assert recommendation.selected_model_id == "model-a"

    missing_intelligence = ModelEvidence(
        model_id="model-a",
        benchmarks=(coding.model_copy(update={"model_id": "model-a", "value": 50.0}),),
    )
    present_intelligence = higher_intelligence.model_copy(
        update={
            "model_id": "model-z",
            "benchmarks": tuple(
                observation.model_copy(update={"model_id": "model-z"})
                for observation in higher_intelligence.benchmarks
            ),
        }
    )
    recommendation = verifier.recommend(
        constraints,
        {"model-a": missing_intelligence, "model-z": present_intelligence},
    )
    assert recommendation.selected_model_id == "model-z"


def test_offline_evaluations_cover_terminal_semantics_without_data_writes() -> None:
    backend_root = Path(__file__).resolve().parents[2]
    generated = backend_root.parent / "data" / "modelops" / "generated"
    before = {
        path.name: path.read_bytes()
        for path in (generated / "catalog.json", generated / "evidence.json")
    }

    cases = load_cases()
    results = asyncio.run(run_cases(cases))

    assert len(results) >= 10
    statuses = {result["id"]: result["status"] for result in results}
    assert statuses["recommend-stale-price"] == RunStatus.COMPLETED.value
    assert statuses["recommend-end-user-country-missing"] == RunStatus.COMPLETED.value
    assert statuses["prepare-update-proposal"] == RunStatus.AWAITING_HUMAN_REVIEW.value
    assert statuses["gateway-no-recoverable-output"] == RunStatus.FAILED.value
    after = {path.name: path.read_bytes() for path in generated.glob("*.json")}
    assert after == before
