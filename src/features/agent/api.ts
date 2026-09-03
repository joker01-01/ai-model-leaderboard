import {
  parseAgentSseEvent,
  type AgentQueryRequest,
  type AgentSseEvent,
  type AgentTerminalEvent,
  type ApiErrorCode,
} from "./types";

export type AgentApiErrorKind = "configuration" | "http" | "network" | "protocol";

interface AgentApiErrorOptions {
  kind: AgentApiErrorKind;
  status?: number;
  code?: ApiErrorCode;
  retryable?: boolean;
  cause?: unknown;
}

export class AgentApiError extends Error {
  readonly kind: AgentApiErrorKind;
  readonly status?: number;
  readonly code?: ApiErrorCode;
  readonly retryable: boolean;

  constructor(message: string, options: AgentApiErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "AgentApiError";
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
  }
}

export interface ReadAgentEventStreamOptions {
  signal?: AbortSignal;
  onEvent: (event: AgentSseEvent) => void;
}

export interface StreamAgentQueryOptions extends ReadAgentEventStreamOptions {
  apiOrigin: string;
  request: AgentQueryRequest;
  fetchImpl?: typeof fetch;
}

interface ParsedSseFrame {
  id: string;
  event: string;
  data: string;
}

interface ParsedApiError {
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
}

const EVENT_SEPARATOR = /\r?\n\r?\n/;
const API_ERROR_CODES = new Set<ApiErrorCode>([
  "invalid_request",
  "service_unavailable",
  "internal_error",
]);

/** Normalize a configured API origin without accepting endpoint paths or URL state. */
export function normalizeAgentApiOrigin(value?: string): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function protocolError(message: string, cause?: unknown): AgentApiError {
  return new AgentApiError(message, { kind: "protocol", cause });
}

function validateRequest(request: AgentQueryRequest): void {
  if (
    typeof request.message !== "string"
    || request.message.length === 0
    || request.message.length > 10_000
    || request.message.trim() !== request.message
  ) {
    throw new AgentApiError("Agent message must be 1-10000 characters without surrounding whitespace.", {
      kind: "configuration",
    });
  }

  if (
    request.session_id !== undefined
    && (
      typeof request.session_id !== "string"
      || request.session_id.length === 0
      || request.session_id.length > 128
      || request.session_id.trim() !== request.session_id
    )
  ) {
    throw new AgentApiError("Agent session_id must be 1-128 characters without surrounding whitespace.", {
      kind: "configuration",
    });
  }
}

function parseSseFrame(frame: string): ParsedSseFrame | null {
  const dataLines: string[] = [];
  let id: string | undefined;
  let event: string | undefined;

  for (const line of frame.replaceAll("\r\n", "\n").split("\n")) {
    if (line === "" || line.startsWith(":")) continue;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    switch (field) {
      case "data":
        dataLines.push(value);
        break;
      case "event":
        if (event !== undefined) throw protocolError("Agent SSE frame contains duplicate event fields.");
        event = value;
        break;
      case "id":
        if (id !== undefined) throw protocolError("Agent SSE frame contains duplicate id fields.");
        id = value;
        break;
      default:
        break;
    }
  }

  if (dataLines.length === 0) return null;
  if (!id) throw protocolError("Agent SSE frame is missing id.");
  if (!event) throw protocolError("Agent SSE frame is missing event.");
  return { id, event, data: dataLines.join("\n") };
}

function decodeSseEvent(frame: ParsedSseFrame): AgentSseEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(frame.data);
  } catch (error) {
    throw protocolError("Agent SSE data is not valid JSON.", error);
  }

  let event: AgentSseEvent;
  try {
    event = parseAgentSseEvent(payload);
  } catch (error) {
    throw protocolError("Agent SSE payload does not match the API contract.", error);
  }

  if (frame.event !== event.event) {
    throw protocolError("Agent SSE event field does not match its JSON payload.");
  }
  if (frame.id !== String(event.sequence)) {
    throw protocolError("Agent SSE id does not match its JSON sequence.");
  }
  return event;
}

function isTerminalEvent(event: AgentSseEvent): event is AgentTerminalEvent {
  return event.event === "run.completed" || event.event === "run.failed";
}

/**
 * Consume one Agent SSE response. `answer.delta` values are emitted unchanged;
 * the UI owns snapshot replacement and rendering policy.
 */
export async function readAgentEventStream(
  stream: ReadableStream<Uint8Array>,
  options: ReadAgentEventStreamOptions,
): Promise<AgentTerminalEvent> {
  throwIfAborted(options.signal);

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let expectedRunId: string | undefined;
  let expectedTraceId: string | undefined;
  let previousSequence: number | undefined;
  let terminal: AgentTerminalEvent | undefined;

  const cancelOnAbort = (): void => {
    void reader.cancel().catch(() => undefined);
  };
  options.signal?.addEventListener("abort", cancelOnAbort, { once: true });

  const consumeFrame = (rawFrame: string): void => {
    throwIfAborted(options.signal);
    const parsedFrame = parseSseFrame(rawFrame);
    if (parsedFrame === null) return;

    const event = decodeSseEvent(parsedFrame);
    if (terminal !== undefined) {
      throw protocolError("Agent SSE stream emitted an event after its terminal event.");
    }

    if (expectedRunId === undefined) {
      expectedRunId = event.run_id;
      expectedTraceId = event.trace_id;
    } else if (event.run_id !== expectedRunId || event.trace_id !== expectedTraceId) {
      throw protocolError("Agent SSE run_id and trace_id must remain fixed for the stream.");
    }

    if (previousSequence !== undefined && event.sequence <= previousSequence) {
      throw protocolError("Agent SSE sequence must be strictly increasing.");
    }
    previousSequence = event.sequence;

    if (isTerminalEvent(event)) terminal = event;
    options.onEvent(event);
  };

  const consumeBufferedFrames = (): void => {
    while (true) {
      const separator = EVENT_SEPARATOR.exec(buffer);
      if (separator === null) return;
      const rawFrame = buffer.slice(0, separator.index);
      buffer = buffer.slice(separator.index + separator[0].length);
      consumeFrame(rawFrame);
    }
  };

  try {
    while (true) {
      throwIfAborted(options.signal);

      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (error) {
        if (options.signal?.aborted || isAbortError(error)) throw abortError();
        throw new AgentApiError("Agent event stream could not be read.", {
          kind: "network",
          retryable: true,
          cause: error,
        });
      }

      throwIfAborted(options.signal);
      if (result.done) {
        buffer += decoder.decode();
        consumeBufferedFrames();
        if (buffer.length > 0) consumeFrame(buffer);
        buffer = "";
        break;
      }

      buffer += decoder.decode(result.value, { stream: true });
      consumeBufferedFrames();
    }
    if (terminal === undefined) {
      throw protocolError("Agent SSE stream ended without a terminal event.");
    }
    return terminal;
  } catch (error) {
    try {
      await reader.cancel(error);
    } catch {
      // Preserve the original stream or protocol failure.
    }
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", cancelOnAbort);
    reader.releaseLock();
  }
}

function parseApiError(value: unknown): ParsedApiError | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const error = (value as Record<string, unknown>).error;
  if (typeof error !== "object" || error === null || Array.isArray(error)) return null;
  const fields = error as Record<string, unknown>;
  if (
    typeof fields.code !== "string"
    || !API_ERROR_CODES.has(fields.code as ApiErrorCode)
    || typeof fields.message !== "string"
    || fields.message.length === 0
    || typeof fields.retryable !== "boolean"
  ) {
    return null;
  }
  return {
    code: fields.code as ApiErrorCode,
    message: fields.message,
    retryable: fields.retryable,
  };
}

async function readHttpError(response: Response, signal?: AbortSignal): Promise<ParsedApiError | null> {
  try {
    const error = parseApiError(await response.json());
    throwIfAborted(signal);
    return error;
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw abortError();
    return null;
  }
}

export async function streamAgentQuery(options: StreamAgentQueryOptions): Promise<AgentTerminalEvent> {
  const apiOrigin = normalizeAgentApiOrigin(options.apiOrigin);
  if (apiOrigin === null) {
    throw new AgentApiError("Agent API origin must be an absolute http(s) origin without a path.", {
      kind: "configuration",
    });
  }
  validateRequest(options.request);
  throwIfAborted(options.signal);

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${apiOrigin}/api/v1/agent/query`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options.request),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) throw abortError();
    throw new AgentApiError("Agent API request could not be completed.", {
      kind: "network",
      retryable: true,
      cause: error,
    });
  }

  throwIfAborted(options.signal);
  if (!response.ok) {
    const apiError = await readHttpError(response, options.signal);
    throw new AgentApiError(apiError?.message ?? `Agent API request failed with HTTP ${response.status}.`, {
      kind: "http",
      status: response.status,
      code: apiError?.code,
      retryable: apiError?.retryable ?? response.status >= 500,
    });
  }

  const contentType = response.headers.get("content-type")?.toLowerCase();
  if (contentType === undefined || contentType.split(";", 1)[0].trim() !== "text/event-stream") {
    throw protocolError("Agent API response is not an event stream.");
  }
  if (response.body === null) throw protocolError("Agent API response has no event stream body.");

  return readAgentEventStream(response.body, options);
}
