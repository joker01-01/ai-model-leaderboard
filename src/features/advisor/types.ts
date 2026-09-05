export type AdvisorAbilityPurpose = "intelligence" | "coding" | "agentic";
export type AdvisorPromotedObjective = "strongest" | "fastest" | "cheapest";
export type AdvisorHardRequirement = "open_weights" | "api_access" | "tool_use" | "commercial_use";
export type AdvisorVerificationStatus = "verified" | "partial" | "aa_only";
export type AdvisorOutcome = "recommendation" | "no_eligible_candidate";
export type AdvisorCheckRequirement = "model_identity" | AdvisorHardRequirement | "deployment_region";
export type AdvisorCheckStatus = "satisfied" | "unverified";
export type AdvisorContradictionRequirement = AdvisorHardRequirement | "deployment_region";

export interface AdvisorBudget {
  readonly currency: "USD";
  readonly monthly_budget: string;
  readonly average_input_tokens: number;
  readonly average_output_tokens: number;
  readonly monthly_request_count: number;
}

export interface AdvisorRecommendationRequest {
  readonly requirement: string;
  readonly deployment_region: string | null;
  readonly budget: AdvisorBudget | null;
}

export interface AdvisorAaSource {
  readonly url: string;
  readonly observed_at: string;
  readonly schema_fingerprint: string;
}

export interface ParsedAdvisorNeed {
  readonly ability_purposes: readonly AdvisorAbilityPurpose[];
  readonly promoted_objective: AdvisorPromotedObjective | null;
  readonly hard_requirements: readonly AdvisorHardRequirement[];
}

export interface AdvisorMetrics {
  readonly intelligence: number | null;
  readonly coding: number | null;
  readonly agentic: number | null;
  readonly input_price_per_million: number | null;
  readonly output_price_per_million: number | null;
  readonly time_to_first_answer_seconds: number | null;
  readonly output_tokens_per_second: number | null;
}

export interface AdvisorCheck {
  readonly requirement: AdvisorCheckRequirement;
  readonly status: AdvisorCheckStatus;
  readonly summary: string;
  readonly citation_ids: readonly string[];
}

export interface AdvisorCandidate {
  readonly source_id: string;
  readonly source_slug: string | null;
  readonly raw_name: string | null;
  readonly creator_id: string | null;
  readonly creator_name: string | null;
  readonly release_date: string | null;
  readonly observed_at: string;
  readonly metrics: AdvisorMetrics;
  readonly estimated_monthly_cost_usd: string | null;
  readonly reason: string;
  readonly verification_status: AdvisorVerificationStatus;
  readonly checks: readonly AdvisorCheck[];
}

export interface AdvisorCitation {
  readonly citation_id: string;
  readonly title: string;
  readonly url: string;
}

export interface AdvisorContradiction {
  readonly requirement: AdvisorContradictionRequirement;
  readonly status: "contradicted";
  readonly summary: string;
  readonly citation_ids: readonly string[];
}

export interface AdvisorRejectionIdentityCheck {
  readonly requirement: "model_identity";
  readonly status: "satisfied";
  readonly summary: string;
  readonly citation_ids: readonly string[];
}

export interface AdvisorRejection {
  readonly source_id: string;
  readonly source_slug: string | null;
  readonly raw_name: string | null;
  readonly creator_id: string | null;
  readonly creator_name: string | null;
  readonly identity_check: AdvisorRejectionIdentityCheck;
  readonly contradictions: readonly AdvisorContradiction[];
}

export interface AdvisorRecommendationResponse {
  readonly outcome: AdvisorOutcome;
  readonly aa_source: AdvisorAaSource;
  readonly parsed_need: ParsedAdvisorNeed;
  readonly verification_status: AdvisorVerificationStatus;
  readonly recommendation: AdvisorCandidate | null;
  readonly alternatives: readonly AdvisorCandidate[];
  readonly rejections: readonly AdvisorRejection[];
  readonly citations: readonly AdvisorCitation[];
}

const REQUEST_KEYS = ["requirement", "deployment_region", "budget"] as const;
const BUDGET_KEYS = [
  "currency",
  "monthly_budget",
  "average_input_tokens",
  "average_output_tokens",
  "monthly_request_count",
] as const;
const RESPONSE_KEYS = [
  "outcome",
  "aa_source",
  "parsed_need",
  "verification_status",
  "recommendation",
  "alternatives",
  "rejections",
  "citations",
] as const;
const AA_SOURCE_KEYS = ["url", "observed_at", "schema_fingerprint"] as const;
const PARSED_NEED_KEYS = ["ability_purposes", "promoted_objective", "hard_requirements"] as const;
const CANDIDATE_KEYS = [
  "source_id",
  "source_slug",
  "raw_name",
  "creator_id",
  "creator_name",
  "release_date",
  "observed_at",
  "metrics",
  "estimated_monthly_cost_usd",
  "reason",
  "verification_status",
  "checks",
] as const;
const METRIC_KEYS = [
  "intelligence",
  "coding",
  "agentic",
  "input_price_per_million",
  "output_price_per_million",
  "time_to_first_answer_seconds",
  "output_tokens_per_second",
] as const;
const CHECK_KEYS = ["requirement", "status", "summary", "citation_ids"] as const;
const REJECTION_KEYS = [
  "source_id",
  "source_slug",
  "raw_name",
  "creator_id",
  "creator_name",
  "identity_check",
  "contradictions",
] as const;
const REJECTION_IDENTITY_CHECK_KEYS = ["requirement", "status", "summary", "citation_ids"] as const;
const CONTRADICTION_KEYS = ["requirement", "status", "summary", "citation_ids"] as const;
const CITATION_KEYS = ["citation_id", "title", "url"] as const;

const ABILITY_PURPOSES = new Set<AdvisorAbilityPurpose>(["intelligence", "coding", "agentic"]);
const PROMOTED_OBJECTIVES = new Set<AdvisorPromotedObjective>(["strongest", "fastest", "cheapest"]);
const HARD_REQUIREMENTS = new Set<AdvisorHardRequirement>([
  "open_weights",
  "api_access",
  "tool_use",
  "commercial_use",
]);
const VERIFICATION_STATUSES = new Set<AdvisorVerificationStatus>(["verified", "partial", "aa_only"]);
const OUTCOMES = new Set<AdvisorOutcome>(["recommendation", "no_eligible_candidate"]);
const CHECK_REQUIREMENTS = new Set<AdvisorCheckRequirement>([
  "model_identity",
  "open_weights",
  "api_access",
  "tool_use",
  "commercial_use",
  "deployment_region",
]);
const CONTRADICTION_REQUIREMENTS = new Set<AdvisorContradictionRequirement>([
  "open_weights",
  "api_access",
  "tool_use",
  "commercial_use",
  "deployment_region",
]);
const CHECK_STATUSES = new Set<AdvisorCheckStatus>(["satisfied", "unverified"]);
const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

function strictObject(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(keys);
  const unknownKey = Object.keys(record).find((key) => !allowed.has(key));
  if (unknownKey !== undefined) throw new TypeError(`${path}.${unknownKey} is not allowed`);
  const missingKey = keys.find((key) => !Object.hasOwn(record, key));
  if (missingKey !== undefined) throw new TypeError(`${path}.${missingKey} is required`);
  return record;
}

function cleanString(value: unknown, path: string, maximumLength = 2_000): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximumLength
    || value.trim() !== value
  ) {
    throw new TypeError(`${path} must be a non-empty trimmed string of at most ${maximumLength} characters`);
  }
  return value;
}

function nullableString(value: unknown, path: string, maximumLength = 2_000): string | null {
  return value === null ? null : cleanString(value, path, maximumLength);
}

function sourceIdentityString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${path} must be a non-empty trimmed string`);
  }
  return value;
}

function nullableSourceIdentityString(value: unknown, path: string): string | null {
  return value === null ? null : sourceIdentityString(value, path);
}

function isoDate(value: unknown, path: string): string {
  const text = cleanString(value, path, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new TypeError(`${path} must be an ISO calendar date`);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new TypeError(`${path} must be an ISO calendar date`);
  }
  return text;
}

function nullableDate(value: unknown, path: string): string | null {
  return value === null ? null : isoDate(value, path);
}

function httpsUrl(value: unknown, path: string): string {
  const text = cleanString(value, path, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new TypeError(`${path} must be an absolute HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    throw new TypeError(`${path} must be an absolute credential-free HTTPS URL`);
  }
  if (parsed.port !== "") throw new TypeError(`${path} must not use a non-default port`);
  if (parsed.hash !== "") throw new TypeError(`${path} must not contain a fragment`);
  return text;
}

function enumValue<Value extends string>(value: unknown, path: string, values: ReadonlySet<Value>): Value {
  if (typeof value !== "string" || !values.has(value as Value)) {
    throw new TypeError(`${path} has an unsupported value`);
  }
  return value as Value;
}

function stringArray(value: unknown, path: string, maximumLength: number): readonly string[] {
  if (!Array.isArray(value) || value.length > maximumLength) {
    throw new TypeError(`${path} must be an array of at most ${maximumLength} items`);
  }
  const items = value.map((item, index) => cleanString(item, `${path}[${index}]`, 256));
  if (new Set(items).size !== items.length) throw new TypeError(`${path} must not contain duplicate values`);
  return Object.freeze(items);
}

function enumArray<Value extends string>(
  value: unknown,
  path: string,
  values: ReadonlySet<Value>,
  minimumLength: number,
  maximumLength: number,
): readonly Value[] {
  if (!Array.isArray(value) || value.length < minimumLength || value.length > maximumLength) {
    throw new TypeError(`${path} must contain ${minimumLength}-${maximumLength} items`);
  }
  const items = value.map((item, index) => enumValue(item, `${path}[${index}]`, values));
  if (new Set(items).size !== items.length) throw new TypeError(`${path} must not contain duplicate values`);
  return Object.freeze(items);
}

function safeInteger(value: unknown, path: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${path} must be a safe integer greater than or equal to ${minimum}`);
  }
  return value;
}

function decimalString(value: unknown, path: string, maximumLength = 128): string {
  if (
    typeof value !== "string"
    || value.length > maximumLength
    || !DECIMAL_PATTERN.test(value)
    || !Number.isFinite(Number(value))
  ) {
    throw new TypeError(`${path} must be a finite non-negative decimal string`);
  }
  return value;
}

function nullableFiniteNumber(value: unknown, path: string, nonNegative = false): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || (nonNegative && value < 0)) {
    throw new TypeError(`${path} must be ${nonNegative ? "a non-negative " : "a "}finite number or null`);
  }
  return value;
}

function parseBudget(value: unknown): AdvisorBudget | null {
  if (value === null) return null;
  const record = strictObject(value, "advisor request.budget", BUDGET_KEYS);
  if (record.currency !== "USD") throw new TypeError("advisor request.budget.currency must equal USD");
  return Object.freeze({
    currency: "USD",
    monthly_budget: decimalString(record.monthly_budget, "advisor request.budget.monthly_budget"),
    average_input_tokens: safeInteger(record.average_input_tokens, "advisor request.budget.average_input_tokens", 0),
    average_output_tokens: safeInteger(record.average_output_tokens, "advisor request.budget.average_output_tokens", 0),
    monthly_request_count: safeInteger(record.monthly_request_count, "advisor request.budget.monthly_request_count", 1),
  });
}

export function parseAdvisorRecommendationRequest(value: unknown): AdvisorRecommendationRequest {
  const record = strictObject(value, "advisor request", REQUEST_KEYS);
  return Object.freeze({
    requirement: cleanString(record.requirement, "advisor request.requirement", 2_000),
    deployment_region: nullableString(record.deployment_region, "advisor request.deployment_region", 64),
    budget: parseBudget(record.budget),
  });
}

function parseAaSource(value: unknown): AdvisorAaSource {
  const record = strictObject(value, "advisor response.aa_source", AA_SOURCE_KEYS);
  return Object.freeze({
    url: httpsUrl(record.url, "advisor response.aa_source.url"),
    observed_at: isoDate(record.observed_at, "advisor response.aa_source.observed_at"),
    schema_fingerprint: cleanString(record.schema_fingerprint, "advisor response.aa_source.schema_fingerprint", 256),
  });
}

function parseNeed(value: unknown): ParsedAdvisorNeed {
  const record = strictObject(value, "advisor response.parsed_need", PARSED_NEED_KEYS);
  const promoted = record.promoted_objective === null
    ? null
    : enumValue(record.promoted_objective, "advisor response.parsed_need.promoted_objective", PROMOTED_OBJECTIVES);
  return Object.freeze({
    ability_purposes: enumArray(
      record.ability_purposes,
      "advisor response.parsed_need.ability_purposes",
      ABILITY_PURPOSES,
      1,
      3,
    ),
    promoted_objective: promoted,
    hard_requirements: enumArray(
      record.hard_requirements,
      "advisor response.parsed_need.hard_requirements",
      HARD_REQUIREMENTS,
      0,
      4,
    ),
  });
}

function parseMetrics(value: unknown, path: string): AdvisorMetrics {
  const record = strictObject(value, path, METRIC_KEYS);
  return Object.freeze({
    intelligence: nullableFiniteNumber(record.intelligence, `${path}.intelligence`),
    coding: nullableFiniteNumber(record.coding, `${path}.coding`),
    agentic: nullableFiniteNumber(record.agentic, `${path}.agentic`),
    input_price_per_million: nullableFiniteNumber(record.input_price_per_million, `${path}.input_price_per_million`, true),
    output_price_per_million: nullableFiniteNumber(record.output_price_per_million, `${path}.output_price_per_million`, true),
    time_to_first_answer_seconds: nullableFiniteNumber(record.time_to_first_answer_seconds, `${path}.time_to_first_answer_seconds`, true),
    output_tokens_per_second: nullableFiniteNumber(record.output_tokens_per_second, `${path}.output_tokens_per_second`, true),
  });
}

function parseCheck(value: unknown, path: string): AdvisorCheck {
  const record = strictObject(value, path, CHECK_KEYS);
  const status = enumValue(record.status, `${path}.status`, CHECK_STATUSES);
  const citationIds = stringArray(record.citation_ids, `${path}.citation_ids`, 20);
  if (status === "satisfied" && citationIds.length === 0) {
    throw new TypeError(`${path} satisfied check must reference at least one citation`);
  }
  return Object.freeze({
    requirement: enumValue(record.requirement, `${path}.requirement`, CHECK_REQUIREMENTS),
    status,
    summary: cleanString(record.summary, `${path}.summary`, 1_000),
    citation_ids: citationIds,
  });
}

function parseCandidate(value: unknown, path: string, observedAt: string): AdvisorCandidate {
  const record = strictObject(value, path, CANDIDATE_KEYS);
  const candidateObservedAt = isoDate(record.observed_at, `${path}.observed_at`);
  if (candidateObservedAt !== observedAt) throw new TypeError(`${path}.observed_at must match advisor response.aa_source.observed_at`);
  if (!Array.isArray(record.checks) || record.checks.length > 6) {
    throw new TypeError(`${path}.checks must be an array of at most 6 items`);
  }
  const checks = record.checks.map((check, index) => parseCheck(check, `${path}.checks[${index}]`));
  const requirements = checks.map((check) => check.requirement);
  if (new Set(requirements).size !== requirements.length) throw new TypeError(`${path}.checks contains duplicate requirements`);
  const verificationStatus = enumValue(record.verification_status, `${path}.verification_status`, VERIFICATION_STATUSES);
  const citationCount = checks.reduce((count, check) => count + check.citation_ids.length, 0);
  if (verificationStatus === "aa_only" && checks.length > 0) {
    throw new TypeError(`${path}.verification_status aa_only cannot contain live verification checks`);
  }
  if (verificationStatus !== "aa_only" && citationCount === 0) {
    throw new TypeError(`${path}.verification_status ${verificationStatus} requires a live citation`);
  }
  return Object.freeze({
    source_id: sourceIdentityString(record.source_id, `${path}.source_id`),
    source_slug: nullableSourceIdentityString(record.source_slug, `${path}.source_slug`),
    raw_name: nullableSourceIdentityString(record.raw_name, `${path}.raw_name`),
    creator_id: nullableSourceIdentityString(record.creator_id, `${path}.creator_id`),
    creator_name: nullableSourceIdentityString(record.creator_name, `${path}.creator_name`),
    release_date: nullableDate(record.release_date, `${path}.release_date`),
    observed_at: candidateObservedAt,
    metrics: parseMetrics(record.metrics, `${path}.metrics`),
    estimated_monthly_cost_usd: record.estimated_monthly_cost_usd === null
      ? null
      : decimalString(record.estimated_monthly_cost_usd, `${path}.estimated_monthly_cost_usd`, 512),
    reason: cleanString(record.reason, `${path}.reason`, 2_000),
    verification_status: verificationStatus,
    checks: Object.freeze(checks),
  });
}

function parseCitation(value: unknown, path: string): AdvisorCitation {
  const record = strictObject(value, path, CITATION_KEYS);
  return Object.freeze({
    citation_id: cleanString(record.citation_id, `${path}.citation_id`, 256),
    title: cleanString(record.title, `${path}.title`, 1_000),
    url: httpsUrl(record.url, `${path}.url`),
  });
}

function parseContradiction(value: unknown, path: string): AdvisorContradiction {
  const record = strictObject(value, path, CONTRADICTION_KEYS);
  const citationIds = stringArray(record.citation_ids, `${path}.citation_ids`, 20);
  if (citationIds.length === 0) {
    throw new TypeError(`${path} contradiction must reference at least one citation`);
  }
  if (record.status !== "contradicted") throw new TypeError(`${path}.status must equal contradicted`);
  return Object.freeze({
    requirement: enumValue(record.requirement, `${path}.requirement`, CONTRADICTION_REQUIREMENTS),
    status: "contradicted",
    summary: cleanString(record.summary, `${path}.summary`, 500),
    citation_ids: citationIds,
  });
}

function parseRejectionIdentityCheck(value: unknown, path: string): AdvisorRejectionIdentityCheck {
  const record = strictObject(value, path, REJECTION_IDENTITY_CHECK_KEYS);
  const citationIds = stringArray(record.citation_ids, `${path}.citation_ids`, 20);
  if (citationIds.length === 0) {
    throw new TypeError(`${path} identity check must reference at least one citation`);
  }
  if (record.requirement !== "model_identity") throw new TypeError(`${path}.requirement must equal model_identity`);
  if (record.status !== "satisfied") throw new TypeError(`${path}.status must equal satisfied`);
  return Object.freeze({
    requirement: "model_identity",
    status: "satisfied",
    summary: cleanString(record.summary, `${path}.summary`, 500),
    citation_ids: citationIds,
  });
}

function parseRejection(value: unknown, path: string): AdvisorRejection {
  const record = strictObject(value, path, REJECTION_KEYS);
  if (!Array.isArray(record.contradictions) || record.contradictions.length < 1 || record.contradictions.length > 5) {
    throw new TypeError(`${path}.contradictions must contain 1-5 items`);
  }
  const contradictions = record.contradictions.map((contradiction, index) => (
    parseContradiction(contradiction, `${path}.contradictions[${index}]`)
  ));
  const requirements = contradictions.map((contradiction) => contradiction.requirement);
  if (new Set(requirements).size !== requirements.length) {
    throw new TypeError(`${path}.contradictions contains a duplicate requirement`);
  }
  return Object.freeze({
    source_id: sourceIdentityString(record.source_id, `${path}.source_id`),
    source_slug: nullableSourceIdentityString(record.source_slug, `${path}.source_slug`),
    raw_name: nullableSourceIdentityString(record.raw_name, `${path}.raw_name`),
    creator_id: nullableSourceIdentityString(record.creator_id, `${path}.creator_id`),
    creator_name: nullableSourceIdentityString(record.creator_name, `${path}.creator_name`),
    identity_check: parseRejectionIdentityCheck(record.identity_check, `${path}.identity_check`),
    contradictions: Object.freeze(contradictions),
  });
}

export function parseAdvisorRecommendationResponse(value: unknown): AdvisorRecommendationResponse {
  const record = strictObject(value, "advisor response", RESPONSE_KEYS);
  const aaSource = parseAaSource(record.aa_source);
  const outcome = enumValue(record.outcome, "advisor response.outcome", OUTCOMES);
  const verificationStatus = enumValue(
    record.verification_status,
    "advisor response.verification_status",
    VERIFICATION_STATUSES,
  );
  const recommendation = record.recommendation === null
    ? null
    : parseCandidate(record.recommendation, "advisor response.recommendation", aaSource.observed_at);
  if (!Array.isArray(record.alternatives) || record.alternatives.length > 2) {
    throw new TypeError("advisor response.alternatives must be an array of at most 2 items");
  }
  const alternatives = record.alternatives.map((candidate, index) => (
    parseCandidate(candidate, `advisor response.alternatives[${index}]`, aaSource.observed_at)
  ));
  if (!Array.isArray(record.rejections) || record.rejections.length > 5) {
    throw new TypeError("advisor response.rejections must be an array of at most 5 items");
  }
  const rejections = record.rejections.map((rejection, index) => (
    parseRejection(rejection, `advisor response.rejections[${index}]`)
  ));
  if (outcome === "recommendation" && recommendation === null) {
    throw new TypeError("advisor response.outcome recommendation requires a primary recommendation");
  }
  if (outcome === "recommendation" && rejections.length > 0) {
    throw new TypeError("advisor response.outcome recommendation requires empty rejections");
  }
  if (outcome === "no_eligible_candidate" && (recommendation !== null || alternatives.length > 0)) {
    throw new TypeError("advisor response.outcome no_eligible_candidate cannot include candidates");
  }
  if (recommendation !== null && recommendation.verification_status !== verificationStatus) {
    throw new TypeError("advisor response.verification_status must match the primary recommendation");
  }

  const candidates = recommendation === null ? alternatives : [recommendation, ...alternatives];
  const sourceIds = candidates.map((candidate) => candidate.source_id);
  if (new Set(sourceIds).size !== sourceIds.length) {
    throw new TypeError("advisor response contains a duplicate source_id candidate");
  }
  const rejectedSourceIds = rejections.map((rejection) => rejection.source_id);
  if (new Set(rejectedSourceIds).size !== rejectedSourceIds.length) {
    throw new TypeError("advisor response.rejections contains a duplicate source_id");
  }
  if (!Array.isArray(record.citations) || record.citations.length > 100) {
    throw new TypeError("advisor response.citations must be an array of at most 100 items");
  }
  const citations = record.citations.map((citation, index) => parseCitation(citation, `advisor response.citations[${index}]`));
  const citationIds = citations.map((citation) => citation.citation_id);
  if (new Set(citationIds).size !== citationIds.length) {
    throw new TypeError("advisor response.citations contains a duplicate citation_id");
  }
  const citationUrls = citations.map((citation) => citation.url);
  if (new Set(citationUrls).size !== citationUrls.length) {
    throw new TypeError("advisor response.citations contains a duplicate citation URL");
  }
  if (verificationStatus !== "aa_only" && recommendation !== null && citations.length === 0) {
    throw new TypeError(`advisor response ${verificationStatus} status requires live citations`);
  }
  if (outcome === "no_eligible_candidate") {
    const isAaOnlyEmptyResult = verificationStatus === "aa_only"
      && rejections.length === 0
      && citations.length === 0;
    const isLiveRejectedResult = verificationStatus === "partial"
      && rejections.length >= 1
      && citations.length > 0;
    if (!isAaOnlyEmptyResult && !isLiveRejectedResult) {
      throw new TypeError(
        "advisor response no_eligible_candidate must be either an aa_only empty result or partial with cited rejections",
      );
    }
  }

  const referencedIds = new Set(candidates.flatMap((candidate) => (
    candidate.checks.flatMap((check) => check.citation_ids)
  )));
  for (const rejection of rejections) {
    for (const citationId of rejection.identity_check.citation_ids) referencedIds.add(citationId);
    for (const contradiction of rejection.contradictions) {
      for (const citationId of contradiction.citation_ids) referencedIds.add(citationId);
    }
  }
  const availableIds = new Set(citationIds);
  for (const referencedId of referencedIds) {
    if (!availableIds.has(referencedId)) {
      throw new TypeError(`advisor response references unknown citation_id ${referencedId}`);
    }
  }
  for (const citationId of availableIds) {
    if (!referencedIds.has(citationId)) {
      throw new TypeError(
        `advisor response citation_id ${citationId} is not referenced by a candidate check or rejection contradiction`,
      );
    }
  }

  return Object.freeze({
    outcome,
    aa_source: aaSource,
    parsed_need: parseNeed(record.parsed_need),
    verification_status: verificationStatus,
    recommendation,
    alternatives: Object.freeze(alternatives),
    rejections: Object.freeze(rejections),
    citations: Object.freeze(citations),
  });
}
