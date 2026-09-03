"""Typed Server-Sent Event projection and disconnect-aware response."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterable, AsyncIterator
from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import Field
from starlette.background import BackgroundTask
from starlette.responses import StreamingResponse
from starlette.types import Receive, Scope, Send

from app.domain.errors import ToolErrorCode, ToolName
from app.domain.models import ModelId, NonEmptyString, StrictModel, UpdateProposal
from app.graph.state import AgentAnswer


class SseEventName(StrEnum):
    RUN_STARTED = "run.started"
    NODE_STARTED = "node.started"
    TOOL_COMPLETED = "tool.completed"
    EVIDENCE_FOUND = "evidence.found"
    CLARIFICATION_REQUIRED = "clarification.required"
    ANSWER_DELTA = "answer.delta"
    PROPOSAL_READY = "proposal.ready"
    RUN_COMPLETED = "run.completed"
    RUN_FAILED = "run.failed"


class RunStartedData(StrictModel):
    status: Literal["running"] = "running"


class NodeEventData(StrictModel):
    node: NonEmptyString
    status: Literal["running"]


class ToolCompletedData(StrictModel):
    tool: ToolName
    status: Literal["completed", "failed"]
    model_id: ModelId | None = None
    error_code: ToolErrorCode | None = None


class EvidenceFoundData(StrictModel):
    model_ids: tuple[ModelId, ...]


class ClarificationRequiredData(StrictModel):
    fields: tuple[NonEmptyString, ...]
    message: NonEmptyString


class AnswerDeltaData(StrictModel):
    text: NonEmptyString


class ProposalReadyData(StrictModel):
    proposal: UpdateProposal


class RunTerminalData(StrictModel):
    answer: AgentAnswer | None = None
    code: Literal["internal_error"] | None = None
    message: NonEmptyString | None = None
    retryable: bool = False


SseEventData = (
    RunStartedData
    | NodeEventData
    | ToolCompletedData
    | EvidenceFoundData
    | ClarificationRequiredData
    | AnswerDeltaData
    | ProposalReadyData
    | RunTerminalData
)


class SseEvent(StrictModel):
    run_id: NonEmptyString
    trace_id: NonEmptyString
    sequence: Annotated[int, Field(gt=0)]
    event: SseEventName
    timestamp: datetime
    data: SseEventData


class SseEventSequence:
    def __init__(self, *, run_id: str, trace_id: str) -> None:
        self._run_id = run_id
        self._trace_id = trace_id
        self._sequence = 0

    def next(self, event: SseEventName, data: SseEventData) -> SseEvent:
        self._sequence += 1
        return SseEvent(
            run_id=self._run_id,
            trace_id=self._trace_id,
            sequence=self._sequence,
            event=event,
            timestamp=datetime.now(UTC),
            data=data,
        )


def encode_sse_event(event: SseEvent) -> bytes:
    payload = event.model_dump_json(by_alias=False, exclude_none=True)
    return f"id: {event.sequence}\nevent: {event.event.value}\ndata: {payload}\n\n".encode()


def encode_sse_heartbeat() -> bytes:
    return b": heartbeat\n\n"


async def _next_queue_item(
    queue: asyncio.Queue[bytes | None],
    *,
    interval_seconds: float,
) -> bytes | None:
    return await asyncio.wait_for(queue.get(), timeout=interval_seconds)


class DisconnectAwareStreamingResponse(StreamingResponse):
    """Cancel the body iterator as soon as the ASGI peer disconnects."""

    def __init__(
        self,
        content: AsyncIterable[bytes],
        *,
        status_code: int = 200,
        background: BackgroundTask | None = None,
    ) -> None:
        super().__init__(
            content,
            status_code=status_code,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
            },
            background=background,
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "websocket":
            await super().__call__(scope, receive, send)
            return

        stream_task = asyncio.create_task(self.stream_response(send))
        disconnect_task = asyncio.create_task(self.listen_for_disconnect(receive))
        try:
            done, _ = await asyncio.wait(
                {stream_task, disconnect_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if disconnect_task in done and not stream_task.done():
                stream_task.cancel()
            if stream_task in done:
                await stream_task
        finally:
            for task in (stream_task, disconnect_task):
                if not task.done():
                    task.cancel()
            await asyncio.gather(stream_task, disconnect_task, return_exceptions=True)
        if self.background is not None:
            await self.background()


async def with_heartbeat(
    source: AsyncIterator[bytes],
    *,
    interval_seconds: float,
) -> AsyncIterator[bytes]:
    """Keep the connection active without cancelling a blocked graph iterator."""

    queue: asyncio.Queue[bytes | None] = asyncio.Queue()
    failure: Exception | None = None

    async def produce() -> None:
        nonlocal failure
        try:
            async for item in source:
                await queue.put(item)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            failure = exc
        finally:
            queue.put_nowait(None)

    producer = asyncio.create_task(produce())
    try:
        while True:
            try:
                item = await _next_queue_item(queue, interval_seconds=interval_seconds)
            except TimeoutError:
                yield encode_sse_heartbeat()
                continue
            if item is None:
                if failure is not None:
                    raise failure
                return
            yield item
    finally:
        if not producer.done():
            producer.cancel()
        await asyncio.gather(producer, return_exceptions=True)
