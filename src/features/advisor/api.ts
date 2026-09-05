import {
  parseAdvisorRecommendationRequest,
  parseAdvisorRecommendationResponse,
  type AdvisorRecommendationRequest,
  type AdvisorRecommendationResponse,
} from "./types";

export type AdvisorApiErrorKind = "configuration" | "http" | "network" | "protocol";
export type AdvisorApiErrorCode = "invalid_request" | "rate_limited" | "service_unavailable" | "internal_error";

interface AdvisorApiErrorOptions {
  readonly kind: AdvisorApiErrorKind;
  readonly status?: number;
  readonly code?: AdvisorApiErrorCode;
  readonly retryable?: boolean;
  readonly retryAfterSeconds?: number;
  readonly cause?: unknown;
}

export class AdvisorApiError extends Error {
  readonly kind: AdvisorApiErrorKind;
  readonly status?: number;
  readonly code?: AdvisorApiErrorCode;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(message: string, options: AdvisorApiErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "AdvisorApiError";
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export interface RequestAdvisorRecommendationOptions {
  readonly apiOrigin: string;
  readonly request: AdvisorRecommendationRequest;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}

interface ParsedApiError {
  readonly code: AdvisorApiErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

const API_ERROR_CODES = new Set<AdvisorApiErrorCode>([
  "invalid_request",
  "rate_limited",
  "service_unavailable",
  "internal_error",
]);

export function normalizeAdvisorApiOrigin(value?: string): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isAdvisorAbortError(error: unknown): boolean {
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

function isJsonResponse(response: Response): boolean {
  return response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

function parseErrorEnvelope(value: unknown): ParsedApiError | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const outer = value as Record<string, unknown>;
  if (Object.keys(outer).length !== 1 || !("error" in outer)) return null;
  const rawError = outer.error;
  if (rawError === null || typeof rawError !== "object" || Array.isArray(rawError)) return null;
  const fields = rawError as Record<string, unknown>;
  if (
    Object.keys(fields).some((key) => !["code", "message", "retryable"].includes(key))
    || !Object.hasOwn(fields, "code")
    || !Object.hasOwn(fields, "message")
    || !Object.hasOwn(fields, "retryable")
    || typeof fields.code !== "string"
    || !API_ERROR_CODES.has(fields.code as AdvisorApiErrorCode)
    || typeof fields.message !== "string"
    || fields.message.length === 0
    || fields.message.length > 1_000
    || fields.message.trim() !== fields.message
    || typeof fields.retryable !== "boolean"
  ) {
    return null;
  }
  return {
    code: fields.code as AdvisorApiErrorCode,
    message: fields.message,
    retryable: fields.retryable,
  };
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get("Retry-After");
  if (value === null || !/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

async function readApiError(response: Response, signal?: AbortSignal): Promise<ParsedApiError | null> {
  if (!isJsonResponse(response)) return null;
  try {
    const value: unknown = await response.json();
    throwIfAborted(signal);
    return parseErrorEnvelope(value);
  } catch (error) {
    if (signal?.aborted || isAdvisorAbortError(error)) throw abortError();
    return null;
  }
}

export async function requestAdvisorRecommendation(
  options: RequestAdvisorRecommendationOptions,
): Promise<AdvisorRecommendationResponse> {
  const apiOrigin = normalizeAdvisorApiOrigin(options.apiOrigin);
  if (apiOrigin === null) {
    throw new AdvisorApiError("Advisor API origin must be an absolute HTTP(S) origin without a path.", {
      kind: "configuration",
    });
  }

  let request: AdvisorRecommendationRequest;
  try {
    request = parseAdvisorRecommendationRequest(options.request);
  } catch (error) {
    throw new AdvisorApiError("Advisor request does not match the public API contract.", {
      kind: "configuration",
      cause: error,
    });
  }
  throwIfAborted(options.signal);

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${apiOrigin}/api/v1/advisor/recommend`, {
      method: "POST",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted || isAdvisorAbortError(error)) throw abortError();
    throw new AdvisorApiError("Advisor API request could not be completed.", {
      kind: "network",
      retryable: true,
      cause: error,
    });
  }

  throwIfAborted(options.signal);
  if (!response.ok) {
    const apiError = await readApiError(response, options.signal);
    throw new AdvisorApiError(apiError?.message ?? `Advisor API request failed with HTTP ${response.status}.`, {
      kind: "http",
      status: response.status,
      code: apiError?.code,
      retryable: apiError?.retryable ?? (response.status >= 500 || response.status === 429),
      retryAfterSeconds: response.status === 429 ? retryAfterSeconds(response) : undefined,
    });
  }
  if (!isJsonResponse(response)) {
    throw new AdvisorApiError("Advisor API response is not JSON.", { kind: "protocol" });
  }

  let value: unknown;
  try {
    value = await response.json();
    throwIfAborted(options.signal);
  } catch (error) {
    if (options.signal?.aborted || isAdvisorAbortError(error)) throw abortError();
    throw new AdvisorApiError("Advisor API response is not valid JSON.", {
      kind: "protocol",
      cause: error,
    });
  }

  try {
    return parseAdvisorRecommendationResponse(value);
  } catch (error) {
    throw new AdvisorApiError("Advisor API response does not match the public contract.", {
      kind: "protocol",
      cause: error,
    });
  }
}
