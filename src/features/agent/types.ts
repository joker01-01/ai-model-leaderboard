export type AgentIntent = "recommend" | "explain_unranked" | "prepare_update";

export type RunStatus =
  | "running"
  | "needs_clarification"
  | "completed"
  | "awaiting_human_review"
  | "failed";

export type ToolName =
  | "list_models"
  | "get_model_benchmarks"
  | "get_model_pricing"
  | "search_provider_docs"
  | "prepare_data_update";

export type ToolErrorCode =
  | "invalid_arguments"
  | "unknown_model"
  | "missing_evidence"
  | "stale_evidence"
  | "ambiguous_version"
  | "conflicting_evidence"
  | "source_not_allowlisted"
  | "upstream_timeout"
  | "upstream_unavailable"
  | "approval_required"
  | "internal_error";

export type ProviderId =
  | "alibaba-cloud-model-studio"
  | "anthropic"
  | "deepseek"
  | "openai"
  | "qwen";

export type RegionId = "cn-beijing" | "de-frankfurt" | "sg" | "us-virginia";
export type CurrencyCode = "CNY" | "USD";
export type ProviderSourceKind = "model_card" | "pricing" | "availability" | "license" | "api_docs";
export type BenchmarkId =
  | "aa-coding"
  | "aa-intelligence"
  | "browsecomp"
  | "gpqa-diamond"
  | "swe-bench-pro"
  | "tau2-bench";

export interface AgentQueryRequest {
  message: string;
  session_id?: string;
}

export interface BenchmarkDefinition {
  id: BenchmarkId;
  dim: "intelligence" | "coding" | "reasoning" | "agent";
  label: string;
  short_label: string;
  unit: "%" | "index";
  source_label: string;
  source_url: string;
  source_tier: "聚合榜";
  calibration: { min: number; max: number };
}

export interface BenchmarkObservation {
  model_id: string;
  benchmark_id: BenchmarkId;
  value: number;
  model_version: string;
  observed_at: string;
  definition: BenchmarkDefinition;
}

/** Pydantic serializes Decimal values as JSON strings; do not recompute prices in the browser. */
export type DecimalString = string;

export interface PricingTier {
  offer_id: string;
  model_id: string;
  provider_model_id: string;
  provider_id: ProviderId;
  region_id: RegionId;
  currency: CurrencyCode;
  unit: "per_1m_tokens";
  billing_mode: "realtime";
  min_input_tokens_exclusive: number;
  max_input_tokens_inclusive?: number;
  input_price: DecimalString;
  cached_input_price?: DecimalString;
  output_price: DecimalString;
  observed_at: string;
  stale_after: string;
  valid_through?: string;
  source_url: string;
}

export interface PricingQuote {
  offer_id: string;
  provider_id: ProviderId;
  provider_model_id: string;
  region_id: RegionId;
  currency: CurrencyCode;
  tier?: PricingTier;
  request_input_tokens: number;
  per_request_cost?: DecimalString;
  monthly_cost?: DecimalString;
  evidence_cutoff?: string;
  status: "available" | "missing_evidence" | "stale_evidence";
  reason?: string;
}

export interface DocumentMatch {
  model_id: string;
  provider_id: ProviderId;
  provider_model_id: string;
  kind: ProviderSourceKind;
  title: string;
  url: string;
  observed_at: string;
  excerpt: string;
}

export interface EvidenceGap {
  code: string;
  message: string;
  field?: string;
}

export interface ModelEvidence {
  model_id: string;
  benchmarks: BenchmarkObservation[];
  pricing: PricingQuote[];
  documents: DocumentMatch[];
  gaps: EvidenceGap[];
}

export interface RecommendationExclusion {
  model_id: string;
  reasons: string[];
}

export interface Recommendation {
  selected_model_id?: string;
  rationale: string[];
  evidence: ModelEvidence[];
  exclusions: RecommendationExclusion[];
}

export interface Citation {
  citation_id: string;
  title: string;
  url: string;
  observed_at: string;
  excerpt?: string;
  provider_id?: ProviderId;
  provider_model_id?: string;
  kind?: ProviderSourceKind;
}

export interface ProposedBenchmarkObservation {
  benchmark_id: BenchmarkId;
  value: number;
  unit: "%" | "index";
  model_version: string;
  source_version_id: string;
  observed_at: string;
  citation_ids: string[];
}

export interface ProposalChange {
  action: "add" | "replace";
  benchmark_id: BenchmarkId;
  before?: BenchmarkObservation;
  after: ProposedBenchmarkObservation;
}

export interface ProposalRisk {
  code: string;
  message: string;
  path?: string;
}

export interface UpdateProposal {
  proposal_id: string;
  status: "awaiting_human_review";
  model_id: string;
  reason: string;
  changes: ProposalChange[];
  citations: Citation[];
  risks: ProposalRisk[];
}

export interface ExactModelResolution {
  query: string;
  status: "exact" | "unknown" | "ambiguous";
  model_ids: string[];
}

export interface GraphIssue {
  code: string;
  message: string;
  retryable: boolean;
}

export type ToolErrorDetail = string | number | boolean | null | string[];

export interface ToolError {
  code: ToolErrorCode;
  message: string;
  tool: ToolName;
  retryable: boolean;
  details: Record<string, ToolErrorDetail>;
}

export interface AgentAnswer {
  status: RunStatus;
  intent?: AgentIntent;
  message: string;
  missing_constraints: string[];
  recommendation?: Recommendation;
  update_proposal?: UpdateProposal;
  resolution?: ExactModelResolution;
  issues: GraphIssue[];
  tool_errors: ToolError[];
}

export type AgentEventName =
  | "run.started"
  | "node.started"
  | "tool.completed"
  | "evidence.found"
  | "clarification.required"
  | "answer.delta"
  | "proposal.ready"
  | "run.completed"
  | "run.failed";

interface AgentEventEnvelope<Event extends AgentEventName, Data> {
  run_id: string;
  trace_id: string;
  sequence: number;
  event: Event;
  timestamp: string;
  data: Data;
}

export type RunStartedEvent = AgentEventEnvelope<"run.started", { status: "running" }>;
export type NodeStartedEvent = AgentEventEnvelope<"node.started", { node: string; status: "running" }>;
export type ToolCompletedEvent = AgentEventEnvelope<
  "tool.completed",
  {
    tool: ToolName;
    status: "completed" | "failed";
    model_id?: string;
    error_code?: ToolErrorCode;
  }
>;
export type EvidenceFoundEvent = AgentEventEnvelope<"evidence.found", { model_ids: string[] }>;
export type ClarificationRequiredEvent = AgentEventEnvelope<
  "clarification.required",
  { fields: string[]; message: string }
>;
export type AnswerDeltaEvent = AgentEventEnvelope<"answer.delta", { text: string }>;
export type ProposalReadyEvent = AgentEventEnvelope<"proposal.ready", { proposal: UpdateProposal }>;

export interface RunTerminalData {
  answer?: AgentAnswer;
  code?: "internal_error";
  message?: string;
  retryable: boolean;
}

export type RunCompletedEvent = AgentEventEnvelope<"run.completed", RunTerminalData>;
export type RunFailedEvent = AgentEventEnvelope<"run.failed", RunTerminalData>;
export type AgentTerminalEvent = RunCompletedEvent | RunFailedEvent;

export type AgentSseEvent =
  | RunStartedEvent
  | NodeStartedEvent
  | ToolCompletedEvent
  | EvidenceFoundEvent
  | ClarificationRequiredEvent
  | AnswerDeltaEvent
  | ProposalReadyEvent
  | AgentTerminalEvent;

export type ApiErrorCode = "invalid_request" | "service_unavailable" | "internal_error";

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
  };
}

const AGENT_INTENTS = new Set<AgentIntent>(["recommend", "explain_unranked", "prepare_update"]);
const RUN_STATUSES = new Set<RunStatus>([
  "running",
  "needs_clarification",
  "completed",
  "awaiting_human_review",
  "failed",
]);
const TOOL_NAMES = new Set<ToolName>([
  "list_models",
  "get_model_benchmarks",
  "get_model_pricing",
  "search_provider_docs",
  "prepare_data_update",
]);
const TOOL_ERROR_CODES = new Set<ToolErrorCode>([
  "invalid_arguments",
  "unknown_model",
  "missing_evidence",
  "stale_evidence",
  "ambiguous_version",
  "conflicting_evidence",
  "source_not_allowlisted",
  "upstream_timeout",
  "upstream_unavailable",
  "approval_required",
  "internal_error",
]);
const EVENT_NAMES = new Set<AgentEventName>([
  "run.started",
  "node.started",
  "tool.completed",
  "evidence.found",
  "clarification.required",
  "answer.delta",
  "proposal.ready",
  "run.completed",
  "run.failed",
]);
const PROVIDER_IDS = new Set<ProviderId>([
  "alibaba-cloud-model-studio",
  "anthropic",
  "deepseek",
  "openai",
  "qwen",
]);
const REGION_IDS = new Set<RegionId>(["cn-beijing", "de-frankfurt", "sg", "us-virginia"]);
const CURRENCY_CODES = new Set<CurrencyCode>(["CNY", "USD"]);
const PROVIDER_SOURCE_KINDS = new Set<ProviderSourceKind>([
  "model_card",
  "pricing",
  "availability",
  "license",
  "api_docs",
]);
const BENCHMARK_IDS = new Set<BenchmarkId>([
  "aa-coding",
  "aa-intelligence",
  "browsecomp",
  "gpqa-diamond",
  "swe-bench-pro",
  "tau2-bench",
]);
const BENCHMARK_DIMENSIONS = new Set<BenchmarkDefinition["dim"]>([
  "intelligence",
  "coding",
  "reasoning",
  "agent",
]);
const BENCHMARK_UNITS = new Set<BenchmarkDefinition["unit"]>(["%", "index"]);
const PRICE_STATUSES = new Set<PricingQuote["status"]>([
  "available",
  "missing_evidence",
  "stale_evidence",
]);
const PROPOSAL_ACTIONS = new Set<ProposalChange["action"]>(["add", "replace"]);
const RESOLUTION_STATUSES = new Set<ExactModelResolution["status"]>(["exact", "unknown", "ambiguous"]);
const STABLE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (!isObject(value)) throw new TypeError(`${path} must be an object`);
  return value;
}

function requireObjectShape(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  const object = requireObject(value, path);
  for (const key of required) {
    if (!Object.hasOwn(object, key)) throw new TypeError(`${path}.${key} is required`);
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new TypeError(`${path}.${key} is not supported`);
  }
  return object;
}

function requireText(value: unknown, path: string): string {
  if (typeof value !== "string") throw new TypeError(`${path} must be a string`);
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${path} must be a clean non-empty string`);
  }
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be a boolean`);
  return value;
}

function requireStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  for (const [index, item] of value.entries()) requireString(item, `${path}[${index}]`);
  return value as string[];
}

function requireTextArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  for (const [index, item] of value.entries()) requireText(item, `${path}[${index}]`);
  return value as string[];
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value;
}

function requireEnum<Value extends string>(
  value: unknown,
  path: string,
  supported: ReadonlySet<Value>,
): Value {
  if (typeof value !== "string" || !supported.has(value as Value)) {
    throw new TypeError(`${path} is not supported`);
  }
  return value as Value;
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${path} must be a finite number`);
  return value;
}

function requireNonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new TypeError(`${path} must be a non-negative integer`);
  }
  return value as number;
}

function requirePositiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${path} must be a positive integer`);
  }
  return value as number;
}

function requireStableId(value: unknown, path: string): string {
  const text = requireString(value, path);
  if (text.length > 128 || !STABLE_ID_PATTERN.test(text)) throw new TypeError(`${path} must be a stable ID`);
  return text;
}

function requireDate(value: unknown, path: string): string {
  const text = requireString(value, path);
  const parts = DATE_PATTERN.exec(text);
  if (parts === null || Number(parts[1]) === 0) throw new TypeError(`${path} must be an ISO date`);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new TypeError(`${path} must be an ISO date`);
  }
  return text;
}

function requireNonNegativeDecimal(value: unknown, path: string): DecimalString {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    throw new TypeError(`${path} must be a finite decimal string`);
  }
  const unsigned = value.startsWith("+") || value.startsWith("-") ? value.slice(1) : value;
  const significand = unsigned.split(/[eE]/, 1)[0];
  if (value.startsWith("-") && /[1-9]/.test(significand)) {
    throw new TypeError(`${path} must be non-negative`);
  }
  return value;
}

function requireAbsoluteHttpsUrl(value: unknown, path: string): string {
  const text = requireString(value, path);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new TypeError(`${path} must be an absolute HTTPS URL`);
  }
  const authority = text.slice(text.indexOf("://") + 3).split(/[/?#]/, 1)[0];
  const hasExplicitPort = authority.startsWith("[")
    ? authority.slice(authority.indexOf("]") + 1).startsWith(":")
    : authority.includes(":");
  if (
    url.protocol !== "https:"
    || url.hostname.length === 0
    || url.username.length > 0
    || url.password.length > 0
    || hasExplicitPort
  ) {
    throw new TypeError(`${path} must be an absolute HTTPS URL without credentials or an explicit port`);
  }
  return text;
}

function validateBenchmarkDefinition(value: unknown, path: string): BenchmarkDefinition {
  const definition = requireObjectShape(value, path, [
    "id",
    "dim",
    "label",
    "short_label",
    "unit",
    "source_label",
    "source_url",
    "source_tier",
    "calibration",
  ]);
  requireEnum(definition.id, `${path}.id`, BENCHMARK_IDS);
  requireEnum(definition.dim, `${path}.dim`, BENCHMARK_DIMENSIONS);
  requireString(definition.label, `${path}.label`);
  requireString(definition.short_label, `${path}.short_label`);
  requireEnum(definition.unit, `${path}.unit`, BENCHMARK_UNITS);
  requireString(definition.source_label, `${path}.source_label`);
  requireString(definition.source_url, `${path}.source_url`);
  if (definition.source_tier !== "聚合榜") throw new TypeError(`${path}.source_tier is not supported`);
  const calibration = requireObjectShape(definition.calibration, `${path}.calibration`, ["min", "max"]);
  const minimum = requireFiniteNumber(calibration.min, `${path}.calibration.min`);
  const maximum = requireFiniteNumber(calibration.max, `${path}.calibration.max`);
  if (minimum >= maximum) throw new TypeError(`${path}.calibration.min must be less than max`);
  return definition as unknown as BenchmarkDefinition;
}

function validateBenchmarkObservation(value: unknown, path: string): BenchmarkObservation {
  const observation = requireObjectShape(value, path, [
    "model_id",
    "benchmark_id",
    "value",
    "model_version",
    "observed_at",
    "definition",
  ]);
  requireStableId(observation.model_id, `${path}.model_id`);
  requireEnum(observation.benchmark_id, `${path}.benchmark_id`, BENCHMARK_IDS);
  requireFiniteNumber(observation.value, `${path}.value`);
  requireString(observation.model_version, `${path}.model_version`);
  requireDate(observation.observed_at, `${path}.observed_at`);
  validateBenchmarkDefinition(observation.definition, `${path}.definition`);
  return observation as unknown as BenchmarkObservation;
}

function validatePricingTier(value: unknown, path: string): PricingTier {
  const tier = requireObjectShape(value, path, [
    "offer_id",
    "model_id",
    "provider_model_id",
    "provider_id",
    "region_id",
    "currency",
    "unit",
    "billing_mode",
    "min_input_tokens_exclusive",
    "input_price",
    "output_price",
    "observed_at",
    "stale_after",
    "source_url",
  ], ["max_input_tokens_inclusive", "cached_input_price", "valid_through"]);
  requireStableId(tier.offer_id, `${path}.offer_id`);
  requireStableId(tier.model_id, `${path}.model_id`);
  requireString(tier.provider_model_id, `${path}.provider_model_id`);
  requireEnum(tier.provider_id, `${path}.provider_id`, PROVIDER_IDS);
  requireEnum(tier.region_id, `${path}.region_id`, REGION_IDS);
  requireEnum(tier.currency, `${path}.currency`, CURRENCY_CODES);
  if (tier.unit !== "per_1m_tokens") throw new TypeError(`${path}.unit is not supported`);
  if (tier.billing_mode !== "realtime") throw new TypeError(`${path}.billing_mode is not supported`);
  const minimum = requireNonNegativeInteger(tier.min_input_tokens_exclusive, `${path}.min_input_tokens_exclusive`);
  if (tier.max_input_tokens_inclusive !== undefined) {
    const maximum = requirePositiveInteger(tier.max_input_tokens_inclusive, `${path}.max_input_tokens_inclusive`);
    if (minimum >= maximum) throw new TypeError(`${path}.max_input_tokens_inclusive must exceed its minimum`);
  }
  requireNonNegativeDecimal(tier.input_price, `${path}.input_price`);
  if (tier.cached_input_price !== undefined) {
    requireNonNegativeDecimal(tier.cached_input_price, `${path}.cached_input_price`);
  }
  requireNonNegativeDecimal(tier.output_price, `${path}.output_price`);
  requireDate(tier.observed_at, `${path}.observed_at`);
  requireDate(tier.stale_after, `${path}.stale_after`);
  if (tier.valid_through !== undefined) requireDate(tier.valid_through, `${path}.valid_through`);
  requireString(tier.source_url, `${path}.source_url`);
  return tier as unknown as PricingTier;
}

function validatePricingQuote(value: unknown, path: string): PricingQuote {
  const quote = requireObjectShape(value, path, [
    "offer_id",
    "provider_id",
    "provider_model_id",
    "region_id",
    "currency",
    "request_input_tokens",
    "status",
  ], ["tier", "per_request_cost", "monthly_cost", "evidence_cutoff", "reason"]);
  requireStableId(quote.offer_id, `${path}.offer_id`);
  requireEnum(quote.provider_id, `${path}.provider_id`, PROVIDER_IDS);
  requireString(quote.provider_model_id, `${path}.provider_model_id`);
  requireEnum(quote.region_id, `${path}.region_id`, REGION_IDS);
  requireEnum(quote.currency, `${path}.currency`, CURRENCY_CODES);
  if (quote.tier !== undefined) validatePricingTier(quote.tier, `${path}.tier`);
  requirePositiveInteger(quote.request_input_tokens, `${path}.request_input_tokens`);
  if (quote.per_request_cost !== undefined) {
    requireNonNegativeDecimal(quote.per_request_cost, `${path}.per_request_cost`);
  }
  if (quote.monthly_cost !== undefined) requireNonNegativeDecimal(quote.monthly_cost, `${path}.monthly_cost`);
  if (quote.evidence_cutoff !== undefined) requireDate(quote.evidence_cutoff, `${path}.evidence_cutoff`);
  requireEnum(quote.status, `${path}.status`, PRICE_STATUSES);
  if (quote.reason !== undefined) requireString(quote.reason, `${path}.reason`);
  return quote as unknown as PricingQuote;
}

function validateDocumentMatch(value: unknown, path: string): DocumentMatch {
  const document = requireObjectShape(value, path, [
    "model_id",
    "provider_id",
    "provider_model_id",
    "kind",
    "title",
    "url",
    "observed_at",
    "excerpt",
  ]);
  requireStableId(document.model_id, `${path}.model_id`);
  requireEnum(document.provider_id, `${path}.provider_id`, PROVIDER_IDS);
  requireString(document.provider_model_id, `${path}.provider_model_id`);
  requireEnum(document.kind, `${path}.kind`, PROVIDER_SOURCE_KINDS);
  requireString(document.title, `${path}.title`);
  requireString(document.url, `${path}.url`);
  requireDate(document.observed_at, `${path}.observed_at`);
  requireString(document.excerpt, `${path}.excerpt`);
  return document as unknown as DocumentMatch;
}

function validateEvidenceGap(value: unknown, path: string): EvidenceGap {
  const gap = requireObjectShape(value, path, ["code", "message"], ["field"]);
  requireString(gap.code, `${path}.code`);
  requireString(gap.message, `${path}.message`);
  if (gap.field !== undefined) requireString(gap.field, `${path}.field`);
  return gap as unknown as EvidenceGap;
}

function validateModelEvidence(value: unknown, path: string): ModelEvidence {
  const evidence = requireObjectShape(value, path, ["model_id", "benchmarks", "pricing", "documents", "gaps"]);
  requireStableId(evidence.model_id, `${path}.model_id`);
  for (const [index, item] of requireArray(evidence.benchmarks, `${path}.benchmarks`).entries()) {
    validateBenchmarkObservation(item, `${path}.benchmarks[${index}]`);
  }
  for (const [index, item] of requireArray(evidence.pricing, `${path}.pricing`).entries()) {
    validatePricingQuote(item, `${path}.pricing[${index}]`);
  }
  for (const [index, item] of requireArray(evidence.documents, `${path}.documents`).entries()) {
    validateDocumentMatch(item, `${path}.documents[${index}]`);
  }
  for (const [index, item] of requireArray(evidence.gaps, `${path}.gaps`).entries()) {
    validateEvidenceGap(item, `${path}.gaps[${index}]`);
  }
  return evidence as unknown as ModelEvidence;
}

function validateRecommendation(value: unknown, path: string): Recommendation {
  const recommendation = requireObjectShape(value, path, ["rationale", "evidence", "exclusions"], [
    "selected_model_id",
  ]);
  if (recommendation.selected_model_id !== undefined) {
    requireStableId(recommendation.selected_model_id, `${path}.selected_model_id`);
  }
  requireStringArray(recommendation.rationale, `${path}.rationale`);
  for (const [index, item] of requireArray(recommendation.evidence, `${path}.evidence`).entries()) {
    validateModelEvidence(item, `${path}.evidence[${index}]`);
  }
  for (const [index, item] of requireArray(recommendation.exclusions, `${path}.exclusions`).entries()) {
    const exclusionPath = `${path}.exclusions[${index}]`;
    const exclusion = requireObjectShape(item, exclusionPath, ["model_id", "reasons"]);
    requireStableId(exclusion.model_id, `${exclusionPath}.model_id`);
    requireStringArray(exclusion.reasons, `${exclusionPath}.reasons`);
  }
  return recommendation as unknown as Recommendation;
}

function validateCitation(value: unknown, path: string): Citation {
  const citation = requireObjectShape(value, path, ["citation_id", "title", "url", "observed_at"], [
    "excerpt",
    "provider_id",
    "provider_model_id",
    "kind",
  ]);
  const citationId = requireString(citation.citation_id, `${path}.citation_id`);
  if (citationId.length > 128) throw new TypeError(`${path}.citation_id must be at most 128 characters`);
  requireString(citation.title, `${path}.title`);
  requireAbsoluteHttpsUrl(citation.url, `${path}.url`);
  requireDate(citation.observed_at, `${path}.observed_at`);
  if (citation.excerpt !== undefined) requireString(citation.excerpt, `${path}.excerpt`);
  const bindingFields = [citation.provider_id, citation.provider_model_id, citation.kind];
  const boundFieldCount = bindingFields.filter((field) => field !== undefined).length;
  if (boundFieldCount !== 0 && boundFieldCount !== bindingFields.length) {
    throw new TypeError(`${path} provider_id, provider_model_id, and kind must be supplied together`);
  }
  if (boundFieldCount > 0) {
    requireEnum(citation.provider_id, `${path}.provider_id`, PROVIDER_IDS);
    requireString(citation.provider_model_id, `${path}.provider_model_id`);
    requireEnum(citation.kind, `${path}.kind`, PROVIDER_SOURCE_KINDS);
  }
  return citation as unknown as Citation;
}

function validateProposedObservation(value: unknown, path: string): ProposedBenchmarkObservation {
  const observation = requireObjectShape(value, path, [
    "benchmark_id",
    "value",
    "unit",
    "model_version",
    "source_version_id",
    "observed_at",
    "citation_ids",
  ]);
  requireEnum(observation.benchmark_id, `${path}.benchmark_id`, BENCHMARK_IDS);
  requireFiniteNumber(observation.value, `${path}.value`);
  requireEnum(observation.unit, `${path}.unit`, BENCHMARK_UNITS);
  requireString(observation.model_version, `${path}.model_version`);
  requireString(observation.source_version_id, `${path}.source_version_id`);
  requireDate(observation.observed_at, `${path}.observed_at`);
  const citationIds = requireStringArray(observation.citation_ids, `${path}.citation_ids`);
  if (citationIds.length === 0 || citationIds.length > 20 || new Set(citationIds).size !== citationIds.length) {
    throw new TypeError(`${path}.citation_ids must contain 1-20 unique IDs`);
  }
  for (const [index, citationId] of citationIds.entries()) {
    if (citationId.length > 128) throw new TypeError(`${path}.citation_ids[${index}] is too long`);
  }
  return observation as unknown as ProposedBenchmarkObservation;
}

function validateProposalChange(value: unknown, path: string): ProposalChange {
  const change = requireObjectShape(value, path, ["action", "benchmark_id", "after"], ["before"]);
  requireEnum(change.action, `${path}.action`, PROPOSAL_ACTIONS);
  requireEnum(change.benchmark_id, `${path}.benchmark_id`, BENCHMARK_IDS);
  if (change.before !== undefined) validateBenchmarkObservation(change.before, `${path}.before`);
  validateProposedObservation(change.after, `${path}.after`);
  return change as unknown as ProposalChange;
}

function validateProposalRisk(value: unknown, path: string): ProposalRisk {
  const risk = requireObjectShape(value, path, ["code", "message"], ["path"]);
  requireString(risk.code, `${path}.code`);
  requireString(risk.message, `${path}.message`);
  if (risk.path !== undefined) requireString(risk.path, `${path}.path`);
  return risk as unknown as ProposalRisk;
}

function validateProposal(value: unknown, path: string): UpdateProposal {
  const proposal = requireObjectShape(value, path, [
    "proposal_id",
    "status",
    "model_id",
    "reason",
    "changes",
    "citations",
    "risks",
  ]);
  requireString(proposal.proposal_id, `${path}.proposal_id`);
  if (proposal.status !== "awaiting_human_review") {
    throw new TypeError(`${path}.status must be awaiting_human_review`);
  }
  requireStableId(proposal.model_id, `${path}.model_id`);
  requireString(proposal.reason, `${path}.reason`);
  for (const [index, item] of requireArray(proposal.changes, `${path}.changes`).entries()) {
    validateProposalChange(item, `${path}.changes[${index}]`);
  }
  for (const [index, item] of requireArray(proposal.citations, `${path}.citations`).entries()) {
    validateCitation(item, `${path}.citations[${index}]`);
  }
  for (const [index, item] of requireArray(proposal.risks, `${path}.risks`).entries()) {
    validateProposalRisk(item, `${path}.risks[${index}]`);
  }
  return proposal as unknown as UpdateProposal;
}

function validateResolution(value: unknown, path: string): ExactModelResolution {
  const resolution = requireObjectShape(value, path, ["query", "status", "model_ids"]);
  requireString(resolution.query, `${path}.query`);
  requireEnum(resolution.status, `${path}.status`, RESOLUTION_STATUSES);
  for (const [index, modelId] of requireArray(resolution.model_ids, `${path}.model_ids`).entries()) {
    requireStableId(modelId, `${path}.model_ids[${index}]`);
  }
  return resolution as unknown as ExactModelResolution;
}

function validateGraphIssue(value: unknown, path: string): GraphIssue {
  const issue = requireObjectShape(value, path, ["code", "message", "retryable"]);
  requireText(issue.code, `${path}.code`);
  requireText(issue.message, `${path}.message`);
  requireBoolean(issue.retryable, `${path}.retryable`);
  return issue as unknown as GraphIssue;
}

function validateToolErrorDetail(value: unknown, path: string): void {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    requireFiniteNumber(value, path);
    return;
  }
  if (typeof value === "string") {
    if (value.length > 500) throw new TypeError(`${path} must be at most 500 characters`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 20) throw new TypeError(`${path} must have at most 20 items`);
    for (const [index, item] of value.entries()) {
      const text = requireText(item, `${path}[${index}]`);
      if (text.length > 500) throw new TypeError(`${path}[${index}] must be at most 500 characters`);
    }
    return;
  }
  throw new TypeError(`${path} is not a supported tool error detail`);
}

function validateToolError(value: unknown, path: string): ToolError {
  const error = requireObjectShape(value, path, ["code", "message", "tool", "retryable", "details"]);
  const code = requireEnum(error.code, `${path}.code`, TOOL_ERROR_CODES);
  requireEnum(error.tool, `${path}.tool`, TOOL_NAMES);
  const message = requireString(error.message, `${path}.message`);
  if (message.length > 500) throw new TypeError(`${path}.message must be at most 500 characters`);
  const retryable = requireBoolean(error.retryable, `${path}.retryable`);
  if (retryable && code !== "upstream_timeout" && code !== "upstream_unavailable") {
    throw new TypeError(`${path}.retryable is not allowed for ${code}`);
  }
  const details = requireObject(error.details, `${path}.details`);
  const detailEntries = Object.entries(details);
  if (detailEntries.length > 12) throw new TypeError(`${path}.details must have at most 12 entries`);
  for (const [key, detail] of detailEntries) {
    if (key.length === 0 || key.length > 64) throw new TypeError(`${path}.details key is invalid`);
    validateToolErrorDetail(detail, `${path}.details.${key}`);
  }
  return error as unknown as ToolError;
}

function validateAgentAnswer(value: unknown, path: string): AgentAnswer {
  const answer = requireObjectShape(value, path, [
    "status",
    "message",
    "missing_constraints",
    "issues",
    "tool_errors",
  ], ["intent", "recommendation", "update_proposal", "resolution"]);
  requireEnum(answer.status, `${path}.status`, RUN_STATUSES);
  if (answer.intent !== undefined) requireEnum(answer.intent, `${path}.intent`, AGENT_INTENTS);
  requireText(answer.message, `${path}.message`);
  requireTextArray(answer.missing_constraints, `${path}.missing_constraints`);
  if (answer.recommendation !== undefined) validateRecommendation(answer.recommendation, `${path}.recommendation`);
  if (answer.update_proposal !== undefined) validateProposal(answer.update_proposal, `${path}.update_proposal`);
  if (answer.resolution !== undefined) validateResolution(answer.resolution, `${path}.resolution`);
  for (const [index, issue] of requireArray(answer.issues, `${path}.issues`).entries()) {
    validateGraphIssue(issue, `${path}.issues[${index}]`);
  }
  for (const [index, error] of requireArray(answer.tool_errors, `${path}.tool_errors`).entries()) {
    validateToolError(error, `${path}.tool_errors[${index}]`);
  }
  return answer as unknown as AgentAnswer;
}

function validateTerminalData(value: unknown, event: "run.completed" | "run.failed"): RunTerminalData {
  const data = requireObjectShape(value, `${event}.data`, ["retryable"], ["answer", "code", "message"]);
  requireBoolean(data.retryable, `${event}.data.retryable`);
  const answer = data.answer === undefined ? undefined : validateAgentAnswer(data.answer, `${event}.data.answer`);
  if (data.code !== undefined && data.code !== "internal_error") {
    throw new TypeError(`${event}.data.code is not supported`);
  }
  if (data.message !== undefined) requireString(data.message, `${event}.data.message`);
  if (event === "run.completed" && answer === undefined) {
    throw new TypeError("run.completed.data.answer is required");
  }
  if (event === "run.completed" && answer?.status === "failed") {
    throw new TypeError("run.completed cannot contain a failed answer");
  }
  if (event === "run.failed" && answer === undefined && data.message === undefined) {
    throw new TypeError("run.failed requires an answer or safe message");
  }
  if (event === "run.failed" && answer !== undefined && answer.status !== "failed") {
    throw new TypeError("run.failed answer must have failed status");
  }
  return data as unknown as RunTerminalData;
}

/** Decode the JSON payload carried by one SSE frame and reject contract drift early. */
export function parseAgentSseEvent(value: unknown): AgentSseEvent {
  const event = requireObjectShape(value, "event", [
    "run_id",
    "trace_id",
    "sequence",
    "event",
    "timestamp",
    "data",
  ]);
  const runId = requireString(event.run_id, "event.run_id");
  const traceId = requireString(event.trace_id, "event.trace_id");
  if (!Number.isInteger(event.sequence) || (event.sequence as number) <= 0) {
    throw new TypeError("event.sequence must be a positive integer");
  }
  const eventName = requireEnum(event.event, "event.event", EVENT_NAMES);
  const timestamp = requireString(event.timestamp, "event.timestamp");
  if (!Number.isFinite(Date.parse(timestamp))) throw new TypeError("event.timestamp must be an ISO timestamp");
  const data = requireObject(event.data, "event.data");

  switch (eventName) {
    case "run.started":
      requireObjectShape(data, "run.started.data", ["status"]);
      if (data.status !== "running") throw new TypeError("run.started.data.status must be running");
      break;
    case "node.started":
      requireObjectShape(data, "node.started.data", ["node", "status"]);
      requireString(data.node, "node.started.data.node");
      if (data.status !== "running") throw new TypeError("node.started.data.status must be running");
      break;
    case "tool.completed":
      requireObjectShape(data, "tool.completed.data", ["tool", "status"], ["model_id", "error_code"]);
      requireEnum(data.tool, "tool.completed.data.tool", TOOL_NAMES);
      if (data.status !== "completed" && data.status !== "failed") {
        throw new TypeError("tool.completed.data.status is not supported");
      }
      if (data.model_id !== undefined) requireStableId(data.model_id, "tool.completed.data.model_id");
      if (data.error_code !== undefined) {
        requireEnum(data.error_code, "tool.completed.data.error_code", TOOL_ERROR_CODES);
      }
      break;
    case "evidence.found":
      requireObjectShape(data, "evidence.found.data", ["model_ids"]);
      for (const [index, modelId] of requireArray(data.model_ids, "evidence.found.data.model_ids").entries()) {
        requireStableId(modelId, `evidence.found.data.model_ids[${index}]`);
      }
      break;
    case "clarification.required":
      requireObjectShape(data, "clarification.required.data", ["fields", "message"]);
      requireStringArray(data.fields, "clarification.required.data.fields");
      requireString(data.message, "clarification.required.data.message");
      break;
    case "answer.delta":
      requireObjectShape(data, "answer.delta.data", ["text"]);
      requireString(data.text, "answer.delta.data.text");
      break;
    case "proposal.ready":
      requireObjectShape(data, "proposal.ready.data", ["proposal"]);
      validateProposal(data.proposal, "proposal.ready.data.proposal");
      break;
    case "run.completed":
    case "run.failed":
      validateTerminalData(data, eventName);
      break;
  }

  return {
    ...event,
    run_id: runId,
    trace_id: traceId,
    sequence: event.sequence as number,
    event: eventName,
    timestamp,
    data,
  } as AgentSseEvent;
}
