import { describe, expect, it, vi } from "vitest";

import {
  AgentApiError,
  normalizeAgentApiOrigin,
  readAgentEventStream,
  streamAgentQuery,
} from "./api";
import type { AgentSseEvent } from "./types";

const RUN_ID = "run-123";
const TRACE_ID = "trace-456";
const TIMESTAMP = "2026-09-04T10:00:00Z";

function payload(
  sequence: number,
  event: AgentSseEvent["event"],
  data: Record<string, unknown>,
  identity: { runId?: string; traceId?: string } = {},
): Record<string, unknown> {
  return {
    run_id: identity.runId ?? RUN_ID,
    trace_id: identity.traceId ?? TRACE_ID,
    sequence,
    event,
    timestamp: TIMESTAMP,
    data,
  };
}

function completedPayload(sequence: number, identity?: { runId?: string; traceId?: string }): Record<string, unknown> {
  return payload(sequence, "run.completed", {
    answer: {
      status: "completed",
      intent: "recommend",
      message: "最终答案",
      missing_constraints: [],
      issues: [],
      tool_errors: [],
    },
    retryable: false,
  }, identity);
}

function frame(
  eventPayload: Record<string, unknown>,
  options: { newline?: "\n" | "\r\n"; headerEvent?: string; id?: string } = {},
): string {
  const newline = options.newline ?? "\n";
  return [
    `id: ${options.id ?? String(eventPayload.sequence)}`,
    `event: ${options.headerEvent ?? String(eventPayload.event)}`,
    `data: ${JSON.stringify(eventPayload)}`,
    "",
    "",
  ].join(newline);
}

function byteStream(text: string, oneByteChunks = false): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (oneByteChunks) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      } else {
        controller.enqueue(bytes);
      }
      controller.close();
    },
  });
}

function eventStreamResponse(text: string): Response {
  return new Response(byteStream(text), {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}

async function expectProtocolFailure(text: string): Promise<void> {
  await expect(readAgentEventStream(byteStream(text), { onEvent: () => undefined })).rejects.toMatchObject({
    name: "AgentApiError",
    kind: "protocol",
  });
}

describe("normalizeAgentApiOrigin", () => {
  it("trims and removes the origin's trailing slash", () => {
    expect(normalizeAgentApiOrigin("  https://api.example.com/  ")).toBe("https://api.example.com");
    expect(normalizeAgentApiOrigin("http://localhost:8000")).toBe("http://localhost:8000");
  });

  it("returns null for empty, non-http, credentialed, or non-origin URLs", () => {
    expect(normalizeAgentApiOrigin()).toBeNull();
    expect(normalizeAgentApiOrigin("   ")).toBeNull();
    expect(normalizeAgentApiOrigin("ftp://api.example.com")).toBeNull();
    expect(normalizeAgentApiOrigin("https://user:pass@api.example.com")).toBeNull();
    expect(normalizeAgentApiOrigin("https://api.example.com/v1")).toBeNull();
    expect(normalizeAgentApiOrigin("https://api.example.com?mode=1")).toBeNull();
    expect(normalizeAgentApiOrigin("https://api.example.com#agent")).toBeNull();
  });
});

describe("readAgentEventStream", () => {
  it("decodes split UTF-8, CRLF/LF, heartbeat comments, and multiple data lines", async () => {
    const started = payload(1, "run.started", { status: "running" });
    const delta = payload(2, "answer.delta", { text: "第二版完整答案：中文" });
    const deltaJson = JSON.stringify(delta);
    const splitAt = deltaJson.indexOf(",\"event\"") + 1;
    const multilineDelta = [
      "id: 2",
      "event: answer.delta",
      `data: ${deltaJson.slice(0, splitAt)}`,
      `data: ${deltaJson.slice(splitAt)}`,
      "",
      "",
    ].join("\r\n");
    const wire = [
      frame(started, { newline: "\r\n" }),
      ": heartbeat\r\n\r\n",
      multilineDelta,
      frame(completedPayload(3)),
    ].join("");
    const events: AgentSseEvent[] = [];

    const terminal = await readAgentEventStream(byteStream(wire, true), {
      onEvent: (event) => events.push(event),
    });

    expect(events.map((event) => event.event)).toEqual([
      "run.started",
      "answer.delta",
      "run.completed",
    ]);
    expect(events[1]).toMatchObject({ event: "answer.delta", data: { text: "第二版完整答案：中文" } });
    expect(terminal).toMatchObject({ event: "run.completed", sequence: 3 });
  });

  it("rejects a non-increasing sequence", async () => {
    const wire = frame(payload(2, "run.started", { status: "running" }))
      + frame(completedPayload(2));
    await expectProtocolFailure(wire);
  });

  it("rejects a changed run or trace identity", async () => {
    const changedRun = frame(payload(1, "run.started", { status: "running" }))
      + frame(completedPayload(2, { runId: "run-other" }));
    const changedTrace = frame(payload(1, "run.started", { status: "running" }))
      + frame(completedPayload(2, { traceId: "trace-other" }));

    await expectProtocolFailure(changedRun);
    await expectProtocolFailure(changedTrace);
  });

  it("rejects mismatched SSE headers", async () => {
    await expectProtocolFailure(frame(completedPayload(1), { id: "9" }));
    await expectProtocolFailure(frame(completedPayload(1), { headerEvent: "run.failed" }));
  });

  it("rejects events after a terminal event and streams without a terminal event", async () => {
    const afterTerminal = frame(completedPayload(1))
      + frame(payload(2, "run.started", { status: "running" }));
    await expectProtocolFailure(afterTerminal);
    await expectProtocolFailure(frame(payload(1, "run.started", { status: "running" })));
  });

  it("cancels the response stream after rejecting a malformed frame", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(frame(payload(1, "run.started", { status: "invalid" }))));
      },
      cancel,
    });

    await expect(readAgentEventStream(stream, { onEvent: () => undefined })).rejects.toMatchObject({
      name: "AgentApiError",
      kind: "protocol",
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("aborts an active stream and does not process later events", async () => {
    const controller = new AbortController();
    const startedFrame = frame(payload(1, "run.started", { status: "running" }));
    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(new TextEncoder().encode(startedFrame));
      },
    });
    const events: AgentSseEvent[] = [];

    const result = readAgentEventStream(stream, {
      signal: controller.signal,
      onEvent: (event) => {
        events.push(event);
        controller.abort();
      },
    });

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(events.map((event) => event.event)).toEqual(["run.started"]);
  });
});

describe("streamAgentQuery", () => {
  it("posts the snake_case request and returns the authoritative terminal event", async () => {
    const mockedFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      eventStreamResponse(frame(completedPayload(1)))
    ));
    const controller = new AbortController();
    const events: AgentSseEvent[] = [];

    const terminal = await streamAgentQuery({
      apiOrigin: " https://agent.example.com/ ",
      request: { message: "推荐一个模型", session_id: "session-1" },
      signal: controller.signal,
      onEvent: (event) => events.push(event),
      fetchImpl: mockedFetch as typeof fetch,
    });

    expect(terminal.event).toBe("run.completed");
    expect(events).toHaveLength(1);
    expect(mockedFetch).toHaveBeenCalledWith(
      "https://agent.example.com/api/v1/agent/query",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "推荐一个模型", session_id: "session-1" }),
        signal: controller.signal,
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
      }),
    );
  });

  it("surfaces a typed HTTP API error", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: {
        code: "service_unavailable",
        message: "Agent runtime is unavailable.",
        retryable: true,
      },
    }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(streamAgentQuery({
      apiOrigin: "https://agent.example.com",
      request: { message: "推荐一个模型" },
      onEvent: () => undefined,
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toMatchObject({
      name: "AgentApiError",
      kind: "http",
      status: 503,
      code: "service_unavailable",
      message: "Agent runtime is unavailable.",
      retryable: true,
    });
  });

  it("rejects non-event-stream content and a missing response body", async () => {
    const wrongContentType = vi.fn(async () => new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const missingBody = vi.fn(async () => new Response(null, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }));
    const request = { message: "推荐一个模型" };

    await expect(streamAgentQuery({
      apiOrigin: "https://agent.example.com",
      request,
      onEvent: () => undefined,
      fetchImpl: wrongContentType as typeof fetch,
    })).rejects.toMatchObject({ kind: "protocol" });
    await expect(streamAgentQuery({
      apiOrigin: "https://agent.example.com",
      request,
      onEvent: () => undefined,
      fetchImpl: missingBody as typeof fetch,
    })).rejects.toMatchObject({ kind: "protocol" });
  });

  it("preserves abort semantics from fetch", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();

    await expect(streamAgentQuery({
      apiOrigin: "https://agent.example.com",
      request: { message: "推荐一个模型" },
      signal: controller.signal,
      onEvent: () => undefined,
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses AgentApiError for invalid configuration", async () => {
    const result = streamAgentQuery({
      apiOrigin: "https://agent.example.com/v1",
      request: { message: "推荐一个模型" },
      onEvent: () => undefined,
    });

    await expect(result).rejects.toBeInstanceOf(AgentApiError);
    await expect(result).rejects.toMatchObject({ kind: "configuration" });
  });
});
