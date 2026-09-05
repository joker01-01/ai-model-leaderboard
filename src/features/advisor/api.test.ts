import { describe, expect, it, vi } from "vitest";

import {
  AdvisorApiError,
  normalizeAdvisorApiOrigin,
  requestAdvisorRecommendation,
} from "./api";
import type { AdvisorRecommendationRequest } from "./types";

const REQUEST: AdvisorRecommendationRequest = {
  requirement: "推荐一个编程模型",
  deployment_region: null,
  budget: null,
};

function responseBody() {
  return {
    outcome: "no_eligible_candidate",
    aa_source: {
      url: "https://artificialanalysis.ai/leaderboards/models",
      observed_at: "2026-09-04",
      schema_fingerprint: "fingerprint-test",
    },
    parsed_need: {
      ability_purposes: ["coding"],
      promoted_objective: null,
      hard_requirements: [],
    },
    verification_status: "aa_only",
    recommendation: null,
    alternatives: [],
    rejections: [],
    citations: [],
  };
}

describe("normalizeAdvisorApiOrigin", () => {
  it("accepts only an absolute credential-free HTTP(S) origin", () => {
    expect(normalizeAdvisorApiOrigin(" https://api.example.com/ ")).toBe("https://api.example.com");
    expect(normalizeAdvisorApiOrigin("http://localhost:8000")).toBe("http://localhost:8000");
    expect(normalizeAdvisorApiOrigin("https://api.example.com/v1")).toBeNull();
    expect(normalizeAdvisorApiOrigin("https://user:pass@api.example.com")).toBeNull();
    expect(normalizeAdvisorApiOrigin("file:///tmp/api")).toBeNull();
  });
});

describe("requestAdvisorRecommendation", () => {
  it("posts the exact snake_case JSON request and parses the response", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(responseBody()), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }));
    const controller = new AbortController();

    const result = await requestAdvisorRecommendation({
      apiOrigin: "https://api.example.com/",
      request: REQUEST,
      signal: controller.signal,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.outcome).toBe("no_eligible_candidate");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/advisor/recommend",
      expect.objectContaining({
        method: "POST",
        credentials: "omit",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(REQUEST),
      }),
    );
  });

  it("surfaces a typed 429 error with Retry-After seconds", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { code: "rate_limited", message: "Too many requests.", retryable: true },
    }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "37" },
    }));

    await expect(requestAdvisorRecommendation({
      apiOrigin: "https://api.example.com",
      request: REQUEST,
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toMatchObject({
      name: "AdvisorApiError",
      kind: "http",
      status: 429,
      code: "rate_limited",
      retryable: true,
      retryAfterSeconds: 37,
    });
  });

  it("rejects malformed JSON contracts and non-JSON success responses", async () => {
    const malformed = vi.fn(async () => new Response(JSON.stringify({ ...responseBody(), trace_id: "leak" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await expect(requestAdvisorRecommendation({
      apiOrigin: "https://api.example.com",
      request: REQUEST,
      fetchImpl: malformed as typeof fetch,
    })).rejects.toMatchObject({ kind: "protocol" });

    const html = vi.fn(async () => new Response("<html></html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }));
    await expect(requestAdvisorRecommendation({
      apiOrigin: "https://api.example.com",
      request: REQUEST,
      fetchImpl: html as typeof fetch,
    })).rejects.toMatchObject({ kind: "protocol" });
  });

  it("preserves abort semantics and rejects invalid API configuration", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    await expect(requestAdvisorRecommendation({
      apiOrigin: "https://api.example.com",
      request: REQUEST,
      signal: controller.signal,
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(requestAdvisorRecommendation({
      apiOrigin: "https://api.example.com/path",
      request: REQUEST,
    })).rejects.toBeInstanceOf(AdvisorApiError);
  });
});
