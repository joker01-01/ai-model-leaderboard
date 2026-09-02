"""Typed graph state and run-scoped dependency context."""

from __future__ import annotations

import operator
from dataclasses import dataclass
from typing import Annotated, Protocol, TypedDict

from app.domain.errors import ToolError, ToolName, ToolResult
from app.domain.models import (
    AgentIntent,
    AgentRequest,
    CandidateDecision,
    ExactModelResolution,
    GetModelBenchmarksInput,
    GetModelPricingInput,
    ListModelsData,
    ListModelsInput,
    ModelBenchmarksData,
    ModelEvidence,
    ModelPricingData,
    PrepareDataUpdateInput,
    Recommendation,
    RunStatus,
    SearchProviderDocsData,
    SearchProviderDocsInput,
    SelectionConstraints,
    StrictModel,
    UpdateProposal,
)
from app.repositories.leaderboard import LeaderboardRepository
from app.services.evidence_verifier import EvidenceVerifier
from app.services.model_gateway import ModelGateway, ParsedAgentRequest


class GraphIssue(StrictModel):
    code: str
    message: str
    retryable: bool = False


class ToolCallRecord(StrictModel):
    tool: ToolName
    ok: bool
    model_id: str | None = None
    error_code: str | None = None


class AgentAnswer(StrictModel):
    status: RunStatus
    intent: AgentIntent | None
    message: str
    missing_constraints: tuple[str, ...] = ()
    recommendation: Recommendation | None = None
    update_proposal: UpdateProposal | None = None
    resolution: ExactModelResolution | None = None
    issues: tuple[GraphIssue, ...] = ()
    tool_errors: tuple[ToolError, ...] = ()


class GraphToolExecutor(Protocol):
    async def list_models(self, request: ListModelsInput) -> ToolResult[ListModelsData]: ...

    async def get_model_benchmarks(
        self,
        request: GetModelBenchmarksInput,
    ) -> ToolResult[ModelBenchmarksData]: ...

    async def get_model_pricing(
        self,
        request: GetModelPricingInput,
    ) -> ToolResult[ModelPricingData]: ...

    async def search_provider_docs(
        self,
        request: SearchProviderDocsInput,
    ) -> ToolResult[SearchProviderDocsData]: ...

    async def prepare_data_update(
        self,
        request: PrepareDataUpdateInput,
    ) -> ToolResult[UpdateProposal]: ...


@dataclass(frozen=True, slots=True)
class GraphContext:
    repository: LeaderboardRepository
    gateway: ModelGateway
    tools: GraphToolExecutor
    verifier: EvidenceVerifier


class AgentState(TypedDict, total=False):
    run_id: str
    trace_id: str
    request: AgentRequest
    parsed: ParsedAgentRequest
    intent: AgentIntent
    constraints: SelectionConstraints
    missing_constraints: tuple[str, ...]
    candidate_model_ids: tuple[str, ...]
    filter_decisions: tuple[CandidateDecision, ...]
    evidence: dict[str, ModelEvidence]
    resolution: ExactModelResolution
    recommendation: Recommendation
    update_input: PrepareDataUpdateInput
    update_proposal: UpdateProposal
    answer_message: str
    status: RunStatus
    issues: Annotated[tuple[GraphIssue, ...], operator.add]
    tool_errors: Annotated[tuple[ToolError, ...], operator.add]
    tool_records: Annotated[tuple[ToolCallRecord, ...], operator.add]
    warnings: Annotated[tuple[str, ...], operator.add]
    answer: AgentAnswer


def initial_state(request: AgentRequest, *, run_id: str, trace_id: str) -> AgentState:
    """Create a complete initial state so reducers never depend on implicit defaults."""

    return {
        "run_id": run_id,
        "trace_id": trace_id,
        "request": request,
        "missing_constraints": (),
        "candidate_model_ids": (),
        "filter_decisions": (),
        "evidence": {},
        "status": RunStatus.RUNNING,
        "issues": (),
        "tool_errors": (),
        "tool_records": (),
        "warnings": (),
    }
