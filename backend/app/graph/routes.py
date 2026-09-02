"""Pure conditional-route functions for the ModelOps graph."""

from __future__ import annotations

from typing import Literal

from app.domain.models import AgentIntent, RunStatus
from app.graph.state import AgentState


def route_after_parse(state: AgentState) -> Literal["clarify", "route_intent", "finalize"]:
    if state.get("status") == RunStatus.FAILED:
        return "finalize"
    if state.get("missing_constraints"):
        return "clarify"
    return "route_intent"


def route_from_intent(
    state: AgentState,
) -> Literal["load_candidates", "inspect_rank_status", "inspect_update_input", "finalize"]:
    intent = state.get("intent")
    if intent == AgentIntent.RECOMMEND:
        return "load_candidates"
    if intent == AgentIntent.EXPLAIN_UNRANKED:
        return "inspect_rank_status"
    if intent == AgentIntent.PREPARE_UPDATE:
        return "inspect_update_input"
    return "finalize"


def route_after_candidates(state: AgentState) -> Literal["collect_evidence", "finalize"]:
    return "collect_evidence" if state.get("candidate_model_ids") or state.get("filter_decisions") else "finalize"


def route_after_evidence(state: AgentState) -> Literal["verify_evidence", "finalize"]:
    return "finalize" if state.get("status") == RunStatus.FAILED else "verify_evidence"


def route_after_rank_inspection(state: AgentState) -> Literal["explain_unranked", "finalize"]:
    return "finalize" if state.get("status") == RunStatus.FAILED else "explain_unranked"
