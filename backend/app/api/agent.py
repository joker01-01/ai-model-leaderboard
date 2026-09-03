"""FastAPI routes over the bounded ModelOps LangGraph runtime."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass
from typing import Annotated, Literal, cast
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from langgraph.graph.state import CompiledStateGraph

from app.api.contracts import (
    AgentInvokeResponse,
    AgentQueryRequest,
    ApiBoundaryError,
    ApiErrorCode,
    ApiErrorResponse,
)
from app.api.sse import (
    AnswerDeltaData,
    ClarificationRequiredData,
    DisconnectAwareStreamingResponse,
    EvidenceFoundData,
    NodeEventData,
    ProposalReadyData,
    RunStartedData,
    RunTerminalData,
    SseEventName,
    SseEventSequence,
    ToolCompletedData,
    encode_sse_event,
    with_heartbeat,
)
from app.domain.errors import ToolErrorCode
from app.domain.models import ModelEvidence, RunStatus, UpdateProposal
from app.graph.state import AgentAnswer, AgentState, GraphContext, ToolCallRecord, initial_state

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class AgentRuntime:
    graph: CompiledStateGraph[AgentState, GraphContext, AgentState, AgentState]
    context: GraphContext
    recursion_limit: int = 32
    heartbeat_seconds: float = 15.0


router = APIRouter(prefix="/api/v1/agent", tags=["agent"])


def _runtime_from_request(request: Request) -> AgentRuntime:
    runtime = getattr(request.app.state, "agent_runtime", None)
    if not isinstance(runtime, AgentRuntime):
        raise ApiBoundaryError(
            status_code=503,
            code=ApiErrorCode.SERVICE_UNAVAILABLE,
            message="The Agent runtime is not available.",
            retryable=True,
        )
    return runtime


def _new_run_ids() -> tuple[str, str]:
    return f"run-{uuid4().hex}", f"trace-{uuid4().hex}"


AgentRuntimeDependency = Annotated[AgentRuntime, Depends(_runtime_from_request)]


async def _invoke_graph(
    request: AgentQueryRequest,
    *,
    runtime: AgentRuntime,
    run_id: str,
    trace_id: str,
) -> AgentAnswer:
    try:
        result = await runtime.graph.ainvoke(
            initial_state(request.to_domain(), run_id=run_id, trace_id=trace_id),
            context=runtime.context,
            config={"recursion_limit": runtime.recursion_limit},
        )
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.error(
            "agent_invoke_failed trace_id=%s error_type=%s",
            trace_id,
            type(exc).__name__,
        )
        raise ApiBoundaryError(
            status_code=500,
            code=ApiErrorCode.INTERNAL_ERROR,
            message="The Agent run failed before producing a structured result.",
        ) from exc
    answer = result.get("answer")
    if not isinstance(answer, AgentAnswer):
        logger.error("agent_invoke_failed trace_id=%s error_type=missing_answer", trace_id)
        raise ApiBoundaryError(
            status_code=500,
            code=ApiErrorCode.INTERNAL_ERROR,
            message="The Agent run failed before producing a structured result.",
        )
    logger.info("agent_run_completed trace_id=%s status=%s", trace_id, answer.status.value)
    return answer


@router.post(
    "/query:invoke",
    response_model=AgentInvokeResponse,
    response_model_by_alias=False,
    responses={
        422: {"model": ApiErrorResponse},
        500: {"model": ApiErrorResponse},
        503: {"model": ApiErrorResponse},
    },
)
async def invoke_agent(
    payload: AgentQueryRequest,
    runtime: AgentRuntimeDependency,
) -> AgentInvokeResponse:
    run_id, trace_id = _new_run_ids()
    answer = await _invoke_graph(
        payload,
        runtime=runtime,
        run_id=run_id,
        trace_id=trace_id,
    )
    return AgentInvokeResponse(run_id=run_id, trace_id=trace_id, answer=answer)


def _mapping(value: object) -> Mapping[str, object]:
    return value if isinstance(value, Mapping) else {}


def _tool_error_code(value: str | None) -> ToolErrorCode | None:
    if value is None:
        return None
    try:
        return ToolErrorCode(value)
    except ValueError:
        return ToolErrorCode.INTERNAL_ERROR


async def _stream_graph_events(
    payload: AgentQueryRequest,
    *,
    runtime: AgentRuntime,
    run_id: str,
    trace_id: str,
) -> AsyncIterator[bytes]:
    sequence = SseEventSequence(run_id=run_id, trace_id=trace_id)
    yield encode_sse_event(sequence.next(SseEventName.RUN_STARTED, RunStartedData()))

    answer: AgentAnswer | None = None
    started_at: dict[str, float] = {}
    last_answer_message: str | None = None
    known_missing_constraints: tuple[str, ...] = ()
    try:
        stream = runtime.graph.astream(
            initial_state(payload.to_domain(), run_id=run_id, trace_id=trace_id),
            context=runtime.context,
            config={"recursion_limit": runtime.recursion_limit},
            stream_mode="tasks",
        )
        async for raw_task in stream:
            task = _mapping(raw_task)
            task_id = str(task.get("id", "unknown"))
            node = str(task.get("name", "unknown"))
            if "result" not in task and "error" not in task:
                started_at[task_id] = time.perf_counter()
                logger.info("agent_node_started trace_id=%s node=%s", trace_id, node)
                yield encode_sse_event(
                    sequence.next(
                        SseEventName.NODE_STARTED,
                        NodeEventData(node=node, status="running"),
                    )
                )
                continue

            result = _mapping(task.get("result"))
            task_failed = task.get("error") is not None
            task_started_at = started_at.pop(task_id, None)
            elapsed_ms = 0 if task_started_at is None else int((time.perf_counter() - task_started_at) * 1_000)
            logger.info(
                "agent_node_completed trace_id=%s node=%s duration_ms=%d status=%s",
                trace_id,
                node,
                elapsed_ms,
                "failed" if task_failed else "completed",
            )

            records = result.get("tool_records", ())
            if isinstance(records, tuple):
                for record in records:
                    if not isinstance(record, ToolCallRecord):
                        continue
                    tool_status: Literal["completed", "failed"] = "completed" if record.ok else "failed"
                    error_code = _tool_error_code(record.error_code)
                    logger.info(
                        "agent_tool_completed trace_id=%s tool=%s duration_ms=%d status=%s",
                        trace_id,
                        record.tool.value,
                        elapsed_ms,
                        tool_status,
                    )
                    yield encode_sse_event(
                        sequence.next(
                            SseEventName.TOOL_COMPLETED,
                            ToolCompletedData(
                                tool=record.tool,
                                status=tool_status,
                                model_id=record.model_id,
                                error_code=error_code,
                            ),
                        )
                    )

            evidence = result.get("evidence")
            if isinstance(evidence, dict):
                model_ids = tuple(
                    sorted(
                        model_id
                        for model_id, item in evidence.items()
                        if isinstance(model_id, str) and isinstance(item, ModelEvidence)
                    )
                )
                if model_ids:
                    yield encode_sse_event(
                        sequence.next(
                            SseEventName.EVIDENCE_FOUND,
                            EvidenceFoundData(model_ids=model_ids),
                        )
                    )

            status = result.get("status")
            message = result.get("answer_message")
            missing = result.get("missing_constraints")
            if isinstance(missing, tuple) and all(isinstance(item, str) for item in missing):
                known_missing_constraints = cast(tuple[str, ...], missing)
            if status == RunStatus.NEEDS_CLARIFICATION and isinstance(message, str):
                yield encode_sse_event(
                    sequence.next(
                        SseEventName.CLARIFICATION_REQUIRED,
                        ClarificationRequiredData(fields=known_missing_constraints, message=message),
                    )
                )
            if isinstance(message, str) and message and message != last_answer_message:
                last_answer_message = message
                yield encode_sse_event(
                    sequence.next(SseEventName.ANSWER_DELTA, AnswerDeltaData(text=message))
                )

            proposal = result.get("update_proposal")
            if isinstance(proposal, UpdateProposal):
                yield encode_sse_event(
                    sequence.next(
                        SseEventName.PROPOSAL_READY,
                        ProposalReadyData(proposal=proposal),
                    )
                )

            possible_answer = result.get("answer")
            if isinstance(possible_answer, AgentAnswer):
                answer = possible_answer

        if answer is None:
            raise RuntimeError("graph stream finished without a structured answer")
        terminal_name = SseEventName.RUN_FAILED if answer.status == RunStatus.FAILED else SseEventName.RUN_COMPLETED
        yield encode_sse_event(
            sequence.next(terminal_name, RunTerminalData(answer=answer))
        )
        logger.info("agent_run_completed trace_id=%s status=%s", trace_id, answer.status.value)
    except asyncio.CancelledError:
        logger.info("agent_run_cancelled trace_id=%s", trace_id)
        raise
    except Exception as exc:
        logger.error(
            "agent_stream_failed trace_id=%s error_type=%s",
            trace_id,
            type(exc).__name__,
        )
        yield encode_sse_event(
            sequence.next(
                SseEventName.RUN_FAILED,
                RunTerminalData(
                    code="internal_error",
                    message="The Agent run failed before producing a structured result.",
                ),
            )
        )


@router.post(
    "/query",
    response_class=DisconnectAwareStreamingResponse,
    responses={
        200: {"content": {"text/event-stream": {}}},
        422: {"model": ApiErrorResponse},
        503: {"model": ApiErrorResponse},
    },
)
async def stream_agent(
    payload: AgentQueryRequest,
    runtime: AgentRuntimeDependency,
) -> DisconnectAwareStreamingResponse:
    run_id, trace_id = _new_run_ids()
    source = _stream_graph_events(
        payload,
        runtime=runtime,
        run_id=run_id,
        trace_id=trace_id,
    )
    return DisconnectAwareStreamingResponse(
        with_heartbeat(source, interval_seconds=runtime.heartbeat_seconds)
    )
