import { describe, expect, it } from "vitest";

import { parseAdvisorRecommendationRequest, parseAdvisorRecommendationResponse } from "./types";

function candidate(sourceId = "source-alpha") {
  return {
    source_id: sourceId,
    source_slug: `slug-${sourceId}`,
    raw_name: "Alpha Model",
    creator_id: "creator-alpha",
    creator_name: "Creator Alpha",
    release_date: "2026-08-01",
    observed_at: "2026-09-04",
    metrics: {
      intelligence: 72.5,
      coding: 81,
      agentic: null,
      input_price_per_million: 0,
      output_price_per_million: 2.5,
      time_to_first_answer_seconds: null,
      output_tokens_per_second: 120,
    },
    estimated_monthly_cost_usd: "2.5000",
    reason: "编程能力优先，且预算满足要求。",
    verification_status: "verified",
    checks: [{
      requirement: "api_access",
      status: "satisfied",
      summary: "官方 API 文档确认可用。",
      citation_ids: [`citation-${sourceId.replace(/^source-/, "")}`],
    }],
  };
}

function rejection(sourceId = "source-alpha") {
  const citationSuffix = sourceId.replace(/^source-/, "");
  return {
    source_id: sourceId,
    source_slug: `slug-${sourceId}`,
    raw_name: "Alpha Model",
    creator_id: "creator-alpha",
    creator_name: "Creator Alpha",
    identity_check: {
      requirement: "model_identity",
      status: "satisfied",
      summary: "官方资料确认该页面对应当前候选模型。",
      citation_ids: [`identity-${citationSuffix}`],
    },
    contradictions: [{
      requirement: "api_access",
      status: "contradicted",
      summary: "官方文档明确说明该服务不提供所需 API。",
      citation_ids: [`citation-${citationSuffix}`],
    }],
  };
}

function response() {
  return {
    outcome: "recommendation",
    aa_source: {
      url: "https://artificialanalysis.ai/leaderboards/models",
      observed_at: "2026-09-04",
      schema_fingerprint: "fingerprint-test",
    },
    parsed_need: {
      ability_purposes: ["coding"],
      promoted_objective: null,
      hard_requirements: ["api_access"],
    },
    verification_status: "verified",
    recommendation: candidate() as ReturnType<typeof candidate> | null,
    alternatives: [] as ReturnType<typeof candidate>[],
    rejections: [] as ReturnType<typeof rejection>[],
    citations: [{
      citation_id: "citation-alpha",
      title: "Creator Alpha API documentation",
      url: "https://creator.example/docs/api",
    }],
  };
}

describe("parseAdvisorRecommendationRequest", () => {
  it("accepts the exact one-shot request and preserves a decimal budget string", () => {
    const parsed = parseAdvisorRecommendationRequest({
      requirement: "为 Python 编程选择一个 API 模型",
      deployment_region: "Singapore",
      budget: {
        currency: "USD",
        monthly_budget: "0.00",
        average_input_tokens: 0,
        average_output_tokens: 800,
        monthly_request_count: 1,
      },
    });

    expect(parsed.budget?.monthly_budget).toBe("0.00");
    expect(parsed.budget?.average_input_tokens).toBe(0);
  });

  it("rejects surrounding whitespace, invalid budget numbers, and unknown fields", () => {
    expect(() => parseAdvisorRecommendationRequest({
      requirement: " padded ",
      deployment_region: null,
      budget: null,
    })).toThrow(/requirement/);
    expect(() => parseAdvisorRecommendationRequest({
      requirement: "预算推荐",
      deployment_region: null,
      budget: {
        currency: "USD",
        monthly_budget: "Infinity",
        average_input_tokens: 0,
        average_output_tokens: 0,
        monthly_request_count: 1,
      },
    })).toThrow(/monthly_budget/);
    expect(() => parseAdvisorRecommendationRequest({
      requirement: "预算推荐",
      deployment_region: null,
      budget: null,
      candidate_id: "forbidden",
    })).toThrow(/candidate_id/);
    expect(() => parseAdvisorRecommendationRequest({
      requirement: "预算推荐",
      deployment_region: null,
      budget: {
        currency: "USD",
        monthly_budget: "1".repeat(129),
        average_input_tokens: 0,
        average_output_tokens: 0,
        monthly_request_count: 1,
      },
    })).toThrow(/monthly_budget/);
  });
});

describe("parseAdvisorRecommendationResponse", () => {
  it("accepts a strict recommendation while preserving null metrics and numeric zero", () => {
    const parsed = parseAdvisorRecommendationResponse(response());

    expect(parsed.recommendation?.metrics.input_price_per_million).toBe(0);
    expect(parsed.recommendation?.metrics.agentic).toBeNull();
    expect(parsed.citations).toHaveLength(1);
  });

  it("accepts source identity text without narrower client-only length caps", () => {
    const longIdentity = response();
    longIdentity.recommendation!.source_id = "s".repeat(513);
    longIdentity.recommendation!.source_slug = "g".repeat(513);
    longIdentity.recommendation!.raw_name = "n".repeat(2_001);
    longIdentity.recommendation!.creator_id = "c".repeat(513);
    longIdentity.recommendation!.creator_name = "m".repeat(513);

    const parsed = parseAdvisorRecommendationResponse(longIdentity);

    expect(parsed.recommendation?.source_id).toHaveLength(513);
    expect(parsed.recommendation?.raw_name).toHaveLength(2_001);
  });

  it("accepts an exact fixed-decimal cost longer than the request budget bound", () => {
    const tinyCost = response();
    tinyCost.recommendation!.estimated_monthly_cost_usd = `0.${"0".repeat(323)}5`;

    const parsed = parseAdvisorRecommendationResponse(tinyCost);

    expect(parsed.recommendation?.estimated_monthly_cost_usd).toBe(`0.${"0".repeat(323)}5`);
  });

  it("bounds exact response costs at 512 fixed-decimal characters", () => {
    const boundary = response();
    boundary.recommendation!.estimated_monthly_cost_usd = `0.${"0".repeat(509)}5`;
    expect(parseAdvisorRecommendationResponse(boundary).recommendation?.estimated_monthly_cost_usd)
      .toHaveLength(512);

    const tooLong = response();
    tooLong.recommendation!.estimated_monthly_cost_usd = `0.${"0".repeat(510)}5`;
    expect(() => parseAdvisorRecommendationResponse(tooLong)).toThrow(/estimated_monthly_cost_usd/);
  });

  it("rejects unknown fields, invalid dates, and non-HTTPS citations", () => {
    const unknown = response();
    Object.assign(unknown, { trace_id: "must-not-leak" });
    expect(() => parseAdvisorRecommendationResponse(unknown)).toThrow(/trace_id/);

    const invalidDate = response();
    invalidDate.aa_source.observed_at = "2026-02-30";
    expect(() => parseAdvisorRecommendationResponse(invalidDate)).toThrow(/observed_at/);

    const insecure = response();
    insecure.citations[0]!.url = "http://creator.example/docs/api";
    expect(() => parseAdvisorRecommendationResponse(insecure)).toThrow(/HTTPS/);

    const nonDefaultPort = response();
    nonDefaultPort.citations[0]!.url = "https://creator.example:8443/docs/api";
    expect(() => parseAdvisorRecommendationResponse(nonDefaultPort)).toThrow(/port/);

    const fragment = response();
    fragment.citations[0]!.url = "https://creator.example/docs/api#pricing";
    expect(() => parseAdvisorRecommendationResponse(fragment)).toThrow(/fragment/);
  });

  it("rejects duplicate candidates, duplicate citations, and open citation references", () => {
    const duplicateCandidate = response();
    duplicateCandidate.alternatives = [candidate()];
    expect(() => parseAdvisorRecommendationResponse(duplicateCandidate)).toThrow(/duplicate source_id/);

    const duplicateCitation = response();
    duplicateCitation.citations.push({ ...duplicateCitation.citations[0]! });
    expect(() => parseAdvisorRecommendationResponse(duplicateCitation)).toThrow(/duplicate citation_id/);

    const duplicateUrl = response();
    duplicateUrl.citations.push({
      citation_id: "citation-same-url",
      title: "Same URL under another ID",
      url: duplicateUrl.citations[0]!.url,
    });
    duplicateUrl.recommendation!.checks[0]!.citation_ids.push("citation-same-url");
    expect(() => parseAdvisorRecommendationResponse(duplicateUrl)).toThrow(/duplicate citation URL/);

    const unknownReference = response();
    unknownReference.recommendation!.checks[0]!.citation_ids = ["citation-missing"];
    expect(() => parseAdvisorRecommendationResponse(unknownReference)).toThrow(/citation-missing/);

    const unreferencedCitation = response();
    unreferencedCitation.citations.push({
      citation_id: "citation-unused",
      title: "Unused source",
      url: "https://unused.example/",
    });
    expect(() => parseAdvisorRecommendationResponse(unreferencedCitation)).toThrow(/citation-unused/);
  });

  it("requires every satisfied check to reference accepted evidence", () => {
    const missingEvidence = response();
    missingEvidence.recommendation!.checks[0]!.citation_ids = [];
    missingEvidence.citations = [];

    expect(() => parseAdvisorRecommendationResponse(missingEvidence)).toThrow(/satisfied check/);
  });

  it("enforces outcome, primary verification status, no-candidate fallback, and alternative count", () => {
    const missingPrimary = response();
    missingPrimary.recommendation = null;
    expect(() => parseAdvisorRecommendationResponse(missingPrimary)).toThrow(/outcome/);

    const mismatchedStatus = response();
    mismatchedStatus.verification_status = "partial";
    expect(() => parseAdvisorRecommendationResponse(mismatchedStatus)).toThrow(/verification_status/);

    const tooManyAlternatives = response();
    tooManyAlternatives.alternatives = [candidate("source-beta"), candidate("source-gamma"), candidate("source-delta")];
    expect(() => parseAdvisorRecommendationResponse(tooManyAlternatives)).toThrow(/alternatives/);

    const noCandidate = response();
    noCandidate.outcome = "no_eligible_candidate";
    noCandidate.verification_status = "aa_only";
    noCandidate.recommendation = null;
    noCandidate.alternatives = [];
    noCandidate.rejections = [];
    noCandidate.citations = [];
    expect(parseAdvisorRecommendationResponse(noCandidate).recommendation).toBeNull();

    const invalidNoCandidate = response();
    invalidNoCandidate.outcome = "no_eligible_candidate";
    invalidNoCandidate.verification_status = "partial";
    invalidNoCandidate.recommendation = null;
    invalidNoCandidate.alternatives = [];
    invalidNoCandidate.rejections = [];
    expect(() => parseAdvisorRecommendationResponse(invalidNoCandidate)).toThrow(/no_eligible_candidate/);
  });

  it("accepts cited live contradictions only for a partial no-candidate outcome", () => {
    const allRejected = response();
    allRejected.outcome = "no_eligible_candidate";
    allRejected.verification_status = "partial";
    allRejected.recommendation = null;
    allRejected.alternatives = [];
    allRejected.rejections = [rejection()];
    allRejected.citations.push({
      citation_id: "identity-alpha",
      title: "Creator Alpha model documentation",
      url: "https://creator.example/docs/models/alpha",
    });

    const parsed = parseAdvisorRecommendationResponse(allRejected);
    expect(parsed.rejections[0]?.identity_check.requirement).toBe("model_identity");
    expect(parsed.rejections[0]?.contradictions[0]?.requirement).toBe("api_access");

    const missingRejectionEvidence = response();
    missingRejectionEvidence.outcome = "no_eligible_candidate";
    missingRejectionEvidence.verification_status = "partial";
    missingRejectionEvidence.recommendation = null;
    missingRejectionEvidence.alternatives = [];
    missingRejectionEvidence.rejections = [rejection()];
    missingRejectionEvidence.rejections[0]!.contradictions[0]!.citation_ids = [];
    missingRejectionEvidence.citations = [];
    expect(() => parseAdvisorRecommendationResponse(missingRejectionEvidence)).toThrow(/contradiction.*citation/i);

    const duplicateRequirements = response();
    duplicateRequirements.outcome = "no_eligible_candidate";
    duplicateRequirements.verification_status = "partial";
    duplicateRequirements.recommendation = null;
    duplicateRequirements.alternatives = [];
    duplicateRequirements.rejections = [rejection()];
    duplicateRequirements.rejections[0]!.contradictions.push({
      ...duplicateRequirements.rejections[0]!.contradictions[0]!,
    });
    expect(() => parseAdvisorRecommendationResponse(duplicateRequirements)).toThrow(/duplicate requirement/);

    const recommendationWithRejection = response();
    recommendationWithRejection.rejections = [rejection()];
    expect(() => parseAdvisorRecommendationResponse(recommendationWithRejection)).toThrow(/recommendation.*rejections/);
  });

  it("allows independently verified alternatives when the primary is AA-only", () => {
    const mixed = response();
    mixed.verification_status = "aa_only";
    mixed.recommendation!.verification_status = "aa_only";
    mixed.recommendation!.checks = [];
    mixed.alternatives = [candidate("source-beta")];
    mixed.citations = [{
      citation_id: "citation-beta",
      title: "Creator Beta API documentation",
      url: "https://beta.example/docs/api",
    }];

    const parsed = parseAdvisorRecommendationResponse(mixed);
    expect(parsed.recommendation?.verification_status).toBe("aa_only");
    expect(parsed.alternatives[0]?.verification_status).toBe("verified");

    const aaOnlyWithChecks = response();
    aaOnlyWithChecks.verification_status = "aa_only";
    aaOnlyWithChecks.recommendation!.verification_status = "aa_only";
    aaOnlyWithChecks.recommendation!.checks[0] = {
      requirement: "api_access",
      status: "unverified",
      summary: "未完成实时核验。",
      citation_ids: [],
    };
    aaOnlyWithChecks.citations = [];
    expect(() => parseAdvisorRecommendationResponse(aaOnlyWithChecks)).toThrow(/aa_only.*checks/);
  });
});
