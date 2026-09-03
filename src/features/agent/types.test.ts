import { describe, expect, it } from "vitest";

import { parseAgentSseEvent } from "./types";

function benchmarkObservation(): Record<string, unknown> {
  return {
    model_id: "qwen-3-5",
    benchmark_id: "gpqa-diamond",
    value: 90,
    model_version: "qwen/qwen3.5-397b-a17b",
    observed_at: "2026-09-02",
    definition: {
      id: "gpqa-diamond",
      dim: "reasoning",
      label: "GPQA Diamond",
      short_label: "GPQA",
      unit: "%",
      source_label: "Artificial Analysis",
      source_url: "https://artificialanalysis.ai/",
      source_tier: "聚合榜",
      calibration: { min: 0, max: 100 },
    },
  };
}

function pricingQuote(): Record<string, unknown> {
  return {
    offer_id: "qwen-35-sg-standard",
    provider_id: "qwen",
    provider_model_id: "qwen/qwen3.5-397b-a17b",
    region_id: "sg",
    currency: "USD",
    tier: {
      offer_id: "qwen-35-sg-standard",
      model_id: "qwen-3-5",
      provider_model_id: "qwen/qwen3.5-397b-a17b",
      provider_id: "qwen",
      region_id: "sg",
      currency: "USD",
      unit: "per_1m_tokens",
      billing_mode: "realtime",
      min_input_tokens_exclusive: 0,
      max_input_tokens_inclusive: 32_000,
      input_price: "0.40",
      cached_input_price: "0.10",
      output_price: "1.20",
      observed_at: "2026-09-02",
      stale_after: "2026-10-02",
      valid_through: "2026-10-15",
      source_url: "provider pricing page",
    },
    request_input_tokens: 2_000,
    per_request_cost: "0.00176",
    monthly_cost: "1.76000",
    evidence_cutoff: "2026-10-02",
    status: "available",
    reason: "Exact provider offer matched.",
  };
}

function recommendation(): Record<string, unknown> {
  return {
    selected_model_id: "qwen-3-5",
    rationale: ["Exact-version evidence satisfies the request."],
    evidence: [{
      model_id: "qwen-3-5",
      benchmarks: [benchmarkObservation()],
      pricing: [pricingQuote()],
      documents: [{
        model_id: "qwen-3-5",
        provider_id: "qwen",
        provider_model_id: "qwen/qwen3.5-397b-a17b",
        kind: "license",
        title: "Qwen license",
        url: "https://example.com/qwen/license",
        observed_at: "2026-09-02",
        excerpt: "The exact model license is documented here.",
      }],
      gaps: [{ code: "latency_missing", message: "No reviewed latency observation.", field: "latency" }],
    }],
    exclusions: [{ model_id: "deepseek-v4", reasons: ["Region evidence is missing."] }],
  };
}

function proposal(): Record<string, unknown> {
  return {
    proposal_id: "proposal-qwen-gpqa",
    status: "awaiting_human_review",
    model_id: "qwen-3-5",
    reason: "Add an exact-version public observation.",
    changes: [{
      action: "replace",
      benchmark_id: "gpqa-diamond",
      before: benchmarkObservation(),
      after: {
        benchmark_id: "gpqa-diamond",
        value: 91,
        unit: "%",
        model_version: "qwen/qwen3.5-397b-a17b",
        source_version_id: "qwen/qwen3.5-397b-a17b",
        observed_at: "2026-09-04",
        citation_ids: ["citation-qwen-gpqa"],
      },
    }],
    citations: [{
      citation_id: "citation-qwen-gpqa",
      title: "Artificial Analysis",
      url: "https://artificialanalysis.ai/leaderboards/models",
      observed_at: "2026-09-04",
      excerpt: "Exact-version GPQA Diamond observation.",
      provider_id: "qwen",
      provider_model_id: "qwen/qwen3.5-397b-a17b",
      kind: "model_card",
    }],
    risks: [{
      code: "human_review_required",
      message: "A reviewer must verify the proposal before publication.",
      path: "data/modelops/reviewed/benchmarks.json",
    }],
  };
}

function minimalAnswer(): Record<string, unknown> {
  return {
    status: "completed",
    message: "Completed.",
    missing_constraints: [],
    issues: [],
    tool_errors: [],
  };
}

function fullAnswer(): Record<string, unknown> {
  return {
    status: "awaiting_human_review",
    intent: "prepare_update",
    message: "A review-only proposal is ready.",
    missing_constraints: [],
    recommendation: recommendation(),
    update_proposal: proposal(),
    resolution: { query: "qwen-3-5", status: "exact", model_ids: ["qwen-3-5"] },
    issues: [{ code: "review_required", message: "Human approval is required.", retryable: false }],
    tool_errors: [{
      code: "upstream_timeout",
      message: "One optional source timed out.",
      tool: "search_provider_docs",
      retryable: true,
      details: {
        attempts: 2,
        elapsed_seconds: 1.5,
        cached: false,
        provider: "qwen",
        model_ids: ["qwen-3-5"],
        response: null,
      },
    }],
  };
}

function completedEvent(answer: Record<string, unknown>): Record<string, unknown> {
  return {
    run_id: "run-contract-test",
    trace_id: "trace-contract-test",
    sequence: 1,
    event: "run.completed",
    timestamp: "2026-09-04T00:00:00Z",
    data: { answer, retryable: false },
  };
}

describe("parseAgentSseEvent nested contracts", () => {
  it("accepts a valid minimal terminal answer", () => {
    expect(parseAgentSseEvent(completedEvent(minimalAnswer()))).toMatchObject({
      event: "run.completed",
      data: { answer: { status: "completed" } },
    });
  });

  it("accepts the complete UI-read recommendation, proposal, and diagnostic structure", () => {
    expect(parseAgentSseEvent(completedEvent(fullAnswer()))).toMatchObject({
      data: {
        answer: {
          recommendation: { selected_model_id: "qwen-3-5" },
          update_proposal: { proposal_id: "proposal-qwen-gpqa" },
          resolution: { status: "exact" },
        },
      },
    });
  });

  it("rejects an empty proposal change object", () => {
    const invalidProposal = proposal();
    invalidProposal.changes = [{}];
    const answer = minimalAnswer();
    answer.update_proposal = invalidProposal;

    expect(() => parseAgentSseEvent(completedEvent(answer))).toThrow(/changes\[0\]\.action is required/);
  });

  it("rejects an empty benchmark object", () => {
    const invalidRecommendation = recommendation();
    const evidence = (invalidRecommendation.evidence as Record<string, unknown>[])[0];
    evidence.benchmarks = [{}];
    const answer = minimalAnswer();
    answer.recommendation = invalidRecommendation;

    expect(() => parseAgentSseEvent(completedEvent(answer))).toThrow(/benchmarks\[0\]\.model_id is required/);
  });

  it("rejects an unsupported pricing status", () => {
    const invalidRecommendation = recommendation();
    const evidence = (invalidRecommendation.evidence as Record<string, unknown>[])[0];
    const quote = (evidence.pricing as Record<string, unknown>[])[0];
    quote.status = "discounted";
    const answer = minimalAnswer();
    answer.recommendation = invalidRecommendation;

    expect(() => parseAgentSseEvent(completedEvent(answer))).toThrow(/pricing\[0\]\.status is not supported/);
  });

  it("rejects a citation URL that is not absolute HTTPS", () => {
    const invalidProposal = proposal();
    const citation = (invalidProposal.citations as Record<string, unknown>[])[0];
    citation.url = "http://artificialanalysis.ai/";
    const answer = minimalAnswer();
    answer.update_proposal = invalidProposal;

    expect(() => parseAgentSseEvent(completedEvent(answer))).toThrow(/citations\[0\]\.url/);
  });

  it("rejects invalid nested dates, non-finite numbers, and optional field types", () => {
    const invalidDateRecommendation = recommendation();
    const dateEvidence = (invalidDateRecommendation.evidence as Record<string, unknown>[])[0];
    const datedBenchmark = (dateEvidence.benchmarks as Record<string, unknown>[])[0];
    datedBenchmark.observed_at = "2026-02-30";
    const dateAnswer = minimalAnswer();
    dateAnswer.recommendation = invalidDateRecommendation;
    expect(() => parseAgentSseEvent(completedEvent(dateAnswer))).toThrow(/observed_at must be an ISO date/);

    const invalidNumberRecommendation = recommendation();
    const numberEvidence = (invalidNumberRecommendation.evidence as Record<string, unknown>[])[0];
    const numberedBenchmark = (numberEvidence.benchmarks as Record<string, unknown>[])[0];
    numberedBenchmark.value = Number.POSITIVE_INFINITY;
    const numberAnswer = minimalAnswer();
    numberAnswer.recommendation = invalidNumberRecommendation;
    expect(() => parseAgentSseEvent(completedEvent(numberAnswer))).toThrow(/value must be a finite number/);

    const invalidOptionalProposal = proposal();
    const citation = (invalidOptionalProposal.citations as Record<string, unknown>[])[0];
    citation.excerpt = 42;
    const optionalAnswer = minimalAnswer();
    optionalAnswer.update_proposal = invalidOptionalProposal;
    expect(() => parseAgentSseEvent(completedEvent(optionalAnswer))).toThrow(/excerpt must be a clean non-empty string/);
  });

  it("rejects unsupported structured tool-error detail values", () => {
    const answer = fullAnswer();
    const toolError = (answer.tool_errors as Record<string, unknown>[])[0];
    toolError.details = { nested: { unsafe: true } };

    expect(() => parseAgentSseEvent(completedEvent(answer))).toThrow(/details\.nested is not a supported/);
  });
});
