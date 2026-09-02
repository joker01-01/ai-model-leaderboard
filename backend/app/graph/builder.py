"""Assemble the executable ModelOps StateGraph."""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.graph.nodes import (
    clarify,
    collect_evidence,
    explain_unranked,
    finalize,
    inspect_rank_status,
    inspect_update_input,
    load_candidates,
    parse_request,
    prepare_proposal,
    recommend,
    route_intent,
    verify_evidence,
)
from app.graph.routes import (
    route_after_candidates,
    route_after_evidence,
    route_after_parse,
    route_after_rank_inspection,
    route_from_intent,
)
from app.graph.state import AgentState, GraphContext


def build_graph() -> CompiledStateGraph[AgentState, GraphContext, AgentState, AgentState]:
    builder: StateGraph[AgentState, GraphContext, AgentState, AgentState] = StateGraph(
        AgentState,
        context_schema=GraphContext,
    )
    builder.add_node("parse_request", parse_request)
    builder.add_node("clarify", clarify)
    builder.add_node("route_intent", route_intent)
    builder.add_node("load_candidates", load_candidates)
    builder.add_node("collect_evidence", collect_evidence)
    builder.add_node("verify_evidence", verify_evidence)
    builder.add_node("recommend", recommend)
    builder.add_node("inspect_rank_status", inspect_rank_status)
    builder.add_node("explain_unranked", explain_unranked)
    builder.add_node("inspect_update_input", inspect_update_input)
    builder.add_node("prepare_proposal", prepare_proposal)
    builder.add_node("finalize", finalize)

    builder.add_edge(START, "parse_request")
    builder.add_conditional_edges(
        "parse_request",
        route_after_parse,
        {
            "clarify": "clarify",
            "route_intent": "route_intent",
            "finalize": "finalize",
        },
    )
    builder.add_edge("clarify", "finalize")
    builder.add_conditional_edges(
        "route_intent",
        route_from_intent,
        {
            "load_candidates": "load_candidates",
            "inspect_rank_status": "inspect_rank_status",
            "inspect_update_input": "inspect_update_input",
            "finalize": "finalize",
        },
    )
    builder.add_conditional_edges(
        "load_candidates",
        route_after_candidates,
        {"collect_evidence": "collect_evidence", "finalize": "finalize"},
    )
    builder.add_conditional_edges(
        "collect_evidence",
        route_after_evidence,
        {"verify_evidence": "verify_evidence", "finalize": "finalize"},
    )
    builder.add_edge("verify_evidence", "recommend")
    builder.add_edge("recommend", "finalize")
    builder.add_conditional_edges(
        "inspect_rank_status",
        route_after_rank_inspection,
        {"explain_unranked": "explain_unranked", "finalize": "finalize"},
    )
    builder.add_edge("explain_unranked", "finalize")
    builder.add_edge("inspect_update_input", "prepare_proposal")
    builder.add_edge("prepare_proposal", "finalize")
    builder.add_edge("finalize", END)
    return builder.compile()
