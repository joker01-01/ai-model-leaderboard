export const MODELOPS_SCHEMA_VERSION = 1 as const;
export const PRICE_FRESHNESS_DAYS = 30 as const;

export interface ModelAliasEntry {
  modelId: string;
  aaSlugs: string[];
  arenaNames: string[];
  benchmarkVersionIds: string[];
  providerModels: ProviderModelBinding[];
}

export interface ProviderModelBinding {
  providerId: ProviderId;
  providerModelId: string;
}

export interface ModelAliasConfig {
  schemaVersion: typeof MODELOPS_SCHEMA_VERSION;
  models: ModelAliasEntry[];
}

export interface PricingEntry {
  offerId: string;
  modelId: string;
  providerModelId: string;
  providerId: ProviderId;
  regionId: RegionId;
  currency: CurrencyCode;
  unit: "per_1m_tokens";
  billingMode: "realtime";
  minInputTokensExclusive: number;
  maxInputTokensInclusive: number | null;
  inputPrice: number;
  cachedInputPrice: number | null;
  outputPrice: number;
  observedAt: string;
  staleAfter: string;
  validThrough: string | null;
  sourceUrl: string;
}

export interface PricingConfig {
  schemaVersion: typeof MODELOPS_SCHEMA_VERSION;
  entries: PricingEntry[];
}

export type ProviderSourceKind = "model_card" | "pricing" | "availability" | "license" | "api_docs";

export type CurrencyCode = "CNY" | "USD";

export type ProviderId =
  | "alibaba-cloud-model-studio"
  | "anthropic"
  | "deepseek"
  | "openai"
  | "qwen";

export type RegionId = "cn-beijing" | "de-frankfurt" | "sg" | "us-virginia";

export interface ProviderSourceEntry {
  modelId: string;
  providerModelId: string;
  providerId: ProviderId;
  kind: ProviderSourceKind;
  title: string;
  url: string;
  observedAt: string;
}

export interface ProviderSourcesConfig {
  schemaVersion: typeof MODELOPS_SCHEMA_VERSION;
  entries: ProviderSourceEntry[];
}

export interface CatalogSource {
  label: string;
  url: string;
}

export interface CatalogModel {
  id: string;
  name: string;
  maker: string;
  makerEn: string;
  country: string;
  flag: string;
  release: string;
  ctx: string | null;
  priceTier: "极高" | "高" | "中" | "低" | "自部署";
  priceNote: string;
  open: boolean;
  license: string;
  badges: string[];
  blurb: string;
  strengths: string[];
  weaknesses: string[];
  sources: CatalogSource[];
  aliases: Omit<ModelAliasEntry, "modelId">;
}

export interface ModelOpsCatalog {
  schemaVersion: typeof MODELOPS_SCHEMA_VERSION;
  dataDate: string;
  models: CatalogModel[];
}

export interface BenchmarkDefinitionRecord {
  id: string;
  dim: "intelligence" | "coding" | "reasoning" | "agent";
  label: string;
  shortLabel: string;
  unit: "%" | "index";
  sourceLabel: string;
  sourceUrl: string;
  sourceTier: "聚合榜";
  calibration: { min: number; max: number };
}

export interface BenchmarkEvidenceRecord {
  modelId: string;
  benchmarkId: string;
  value: number;
  modelVersion: string;
  observedAt: string;
  definition: BenchmarkDefinitionRecord;
}

export type ArenaDimension = "text" | "webdev" | "agent";

export interface ArenaEvidenceRecord {
  modelId: string;
  dimension: ArenaDimension;
  value: number;
  rank: number | null;
  lower: number | null;
  upper: number | null;
  observations: number | null;
  category: string;
  observedAt: string;
  modelVersion: string;
}

export interface ModelOpsEvidence {
  schemaVersion: typeof MODELOPS_SCHEMA_VERSION;
  benchmarkDate: string;
  benchmarkDefinitions: BenchmarkDefinitionRecord[];
  benchmarkObservations: BenchmarkEvidenceRecord[];
  arena: {
    generatedAt: string | null;
    sourceUrl: string;
    observations: ArenaEvidenceRecord[];
  };
  pricing: PricingEntry[];
  providerSources: ProviderSourceEntry[];
}

type JsonObject = Record<string, unknown>;

const PROVIDER_SOURCE_KINDS = new Set<ProviderSourceKind>([
  "model_card",
  "pricing",
  "availability",
  "license",
  "api_docs",
]);

const PROVIDER_IDS = new Set<ProviderId>([
  "alibaba-cloud-model-studio",
  "anthropic",
  "deepseek",
  "openai",
  "qwen",
]);

const REGION_IDS = new Set<RegionId>([
  "cn-beijing",
  "de-frankfurt",
  "sg",
  "us-virginia",
]);

const CURRENCY_CODES = new Set<CurrencyCode>(["CNY", "USD"]);

const PROVIDER_SOURCE_HOSTS: Record<ProviderId, ReadonlySet<string>> = {
  "alibaba-cloud-model-studio": new Set(["help.aliyun.com", "www.alibabacloud.com"]),
  anthropic: new Set(["platform.claude.com", "www.anthropic.com"]),
  deepseek: new Set(["api-docs.deepseek.com", "huggingface.co"]),
  openai: new Set(["developers.openai.com"]),
  qwen: new Set(["huggingface.co"]),
};

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function asObject(value: unknown, path: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "expected an object");
  }
  return value as JsonObject;
}

function assertExactKeys(value: JsonObject, keys: readonly string[], path: string): void {
  const expected = new Set(keys);
  const unexpected = Object.keys(value).filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !(key in value));
  if (unexpected.length > 0) fail(path, `unexpected fields: ${unexpected.join(", ")}`);
  if (missing.length > 0) fail(path, `missing fields: ${missing.join(", ")}`);
}

function asNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(path, "expected a non-empty string");
  if (value.trim() !== value) fail(path, "leading or trailing whitespace is not allowed");
  return value;
}

function asStableId(value: unknown, path: string): string {
  const id = asNonEmptyString(value, path);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) fail(path, "expected a lowercase kebab-case ID");
  return id;
}

function asProviderId(value: unknown, path: string): ProviderId {
  if (typeof value !== "string" || !PROVIDER_IDS.has(value as ProviderId)) fail(path, "unsupported providerId");
  return value as ProviderId;
}

function asRegionId(value: unknown, path: string): RegionId {
  if (typeof value !== "string" || !REGION_IDS.has(value as RegionId)) fail(path, "unsupported regionId");
  return value as RegionId;
}

function asCurrencyCode(value: unknown, path: string): CurrencyCode {
  if (typeof value !== "string" || !CURRENCY_CODES.has(value as CurrencyCode)) {
    fail(path, "unsupported currency");
  }
  return value as CurrencyCode;
}

function asUniqueStrings(value: unknown, path: string, allowEmpty: boolean): string[] {
  if (!Array.isArray(value)) fail(path, "expected an array");
  const strings = value.map((item, index) => asNonEmptyString(item, `${path}[${index}]`));
  if (!allowEmpty && strings.length === 0) fail(path, "expected at least one value");
  if (new Set(strings).size !== strings.length) fail(path, "duplicate values are not allowed");
  return strings;
}

function asProviderHttpsUrl(value: unknown, path: string, providerId: ProviderId): string {
  const url = asNonEmptyString(value, path);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail(path, "expected a valid URL");
  }
  if (parsed.protocol !== "https:") {
    fail(path, "only HTTPS URLs are allowed");
  }
  if (parsed.username !== "" || parsed.password !== "") fail(path, "URL credentials are not allowed");
  if (parsed.port !== "") fail(path, "explicit ports are not allowed");
  if (!PROVIDER_SOURCE_HOSTS[providerId].has(parsed.hostname.toLowerCase())) {
    fail(path, `host is not allowlisted for providerId ${providerId}`);
  }
  return url;
}

function asIsoDate(value: unknown, path: string): string {
  const date = asNonEmptyString(value, path);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) fail(path, "expected YYYY-MM-DD");
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    parsed.getUTCFullYear() !== Number(year)
    || parsed.getUTCMonth() + 1 !== Number(month)
    || parsed.getUTCDate() !== Number(day)
  ) {
    fail(path, "expected a valid calendar date");
  }
  return date;
}

function addIsoDateDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function asNonNegativeNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(path, "expected a finite non-negative number");
  }
  return value;
}

function asNullableNonNegativeNumber(value: unknown, path: string): number | null {
  return value === null ? null : asNonNegativeNumber(value, path);
}

function asNullablePositiveInteger(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    fail(path, "expected a positive integer or null");
  }
  return value;
}

function asNonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(path, "expected a non-negative integer");
  }
  return value;
}

function asNullableIsoDate(value: unknown, path: string): string | null {
  return value === null ? null : asIsoDate(value, path);
}

function assertSchemaVersion(value: unknown, path: string): asserts value is typeof MODELOPS_SCHEMA_VERSION {
  if (value !== MODELOPS_SCHEMA_VERSION) fail(path, `expected ${MODELOPS_SCHEMA_VERSION}`);
}

function assertKnownModel(modelId: string, knownModelIds: ReadonlySet<string>, path: string): void {
  if (!knownModelIds.has(modelId)) fail(path, `unknown modelId ${JSON.stringify(modelId)}`);
}

function assertUniqueBy<T>(entries: T[], keyOf: (entry: T) => string, path: string): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = keyOf(entry);
    if (seen.has(key)) fail(path, `duplicate entry ${JSON.stringify(key)}`);
    seen.add(key);
  }
}

function assertAliasesHaveSingleOwners(
  models: ModelAliasEntry[],
  field: "aaSlugs" | "arenaNames" | "benchmarkVersionIds",
  path: string,
): void {
  const owners = new Map<string, string>();
  for (const model of models) {
    for (const alias of model[field]) {
      const existingOwner = owners.get(alias);
      if (existingOwner) fail(path, `${JSON.stringify(alias)} is assigned to both ${existingOwner} and ${model.modelId}`);
      owners.set(alias, model.modelId);
    }
  }
}

function parseProviderModels(value: unknown, path: string): ProviderModelBinding[] {
  if (!Array.isArray(value)) fail(path, "expected an array");
  const bindings = value.map((item, index): ProviderModelBinding => {
    const itemPath = `${path}[${index}]`;
    const binding = asObject(item, itemPath);
    assertExactKeys(binding, ["providerId", "providerModelId"], itemPath);
    return {
      providerId: asProviderId(binding.providerId, `${itemPath}.providerId`),
      providerModelId: asNonEmptyString(binding.providerModelId, `${itemPath}.providerModelId`),
    };
  });
  assertUniqueBy(
    bindings,
    (binding) => `${binding.providerId}|${binding.providerModelId}`,
    path,
  );
  return bindings;
}

function assertProviderModelsHaveSingleOwners(models: ModelAliasEntry[], path: string): void {
  const owners = new Map<string, string>();
  for (const model of models) {
    for (const binding of model.providerModels) {
      const key = `${binding.providerId}|${binding.providerModelId}`;
      const existingOwner = owners.get(key);
      if (existingOwner) {
        fail(path, `${JSON.stringify(key)} is assigned to both ${existingOwner} and ${model.modelId}`);
      }
      owners.set(key, model.modelId);
    }
  }
}

export function parseModelAliasConfig(value: unknown, knownModelIds: ReadonlySet<string>): ModelAliasConfig {
  const root = asObject(value, "model-aliases.json");
  assertExactKeys(root, ["schemaVersion", "models"], "model-aliases.json");
  assertSchemaVersion(root.schemaVersion, "model-aliases.json.schemaVersion");
  if (!Array.isArray(root.models)) fail("model-aliases.json.models", "expected an array");

  const models = root.models.map((item, index): ModelAliasEntry => {
    const path = `model-aliases.json.models[${index}]`;
    const entry = asObject(item, path);
    const keys = ["modelId", "aaSlugs", "arenaNames"];
    if ("benchmarkVersionIds" in entry) keys.push("benchmarkVersionIds");
    if ("providerModels" in entry) keys.push("providerModels");
    assertExactKeys(entry, keys, path);
    const modelId = asNonEmptyString(entry.modelId, `${path}.modelId`);
    assertKnownModel(modelId, knownModelIds, `${path}.modelId`);
    return {
      modelId,
      aaSlugs: asUniqueStrings(entry.aaSlugs, `${path}.aaSlugs`, true),
      arenaNames: asUniqueStrings(entry.arenaNames, `${path}.arenaNames`, true),
      benchmarkVersionIds: asUniqueStrings(entry.benchmarkVersionIds ?? [], `${path}.benchmarkVersionIds`, true),
      providerModels: parseProviderModels(entry.providerModels ?? [], `${path}.providerModels`),
    };
  });

  assertUniqueBy(models, (entry) => entry.modelId, "model-aliases.json.models");
  assertAliasesHaveSingleOwners(models, "aaSlugs", "model-aliases.json.models.aaSlugs");
  assertAliasesHaveSingleOwners(models, "arenaNames", "model-aliases.json.models.arenaNames");
  assertAliasesHaveSingleOwners(models, "benchmarkVersionIds", "model-aliases.json.models.benchmarkVersionIds");
  assertProviderModelsHaveSingleOwners(models, "model-aliases.json.models.providerModels");
  const aliasIds = new Set(models.map((entry) => entry.modelId));
  const missing = [...knownModelIds].filter((modelId) => !aliasIds.has(modelId));
  if (missing.length > 0) fail("model-aliases.json.models", `missing model IDs: ${missing.join(", ")}`);
  return { schemaVersion: MODELOPS_SCHEMA_VERSION, models };
}

export function parsePricingConfig(value: unknown, knownModelIds: ReadonlySet<string>): PricingConfig {
  const root = asObject(value, "pricing.json");
  assertExactKeys(root, ["schemaVersion", "entries"], "pricing.json");
  assertSchemaVersion(root.schemaVersion, "pricing.json.schemaVersion");
  if (!Array.isArray(root.entries)) fail("pricing.json.entries", "expected an array");

  const entries = root.entries.map((item, index): PricingEntry => {
    const path = `pricing.json.entries[${index}]`;
    const entry = asObject(item, path);
    assertExactKeys(entry, [
      "offerId",
      "modelId",
      "providerModelId",
      "providerId",
      "regionId",
      "currency",
      "unit",
      "billingMode",
      "minInputTokensExclusive",
      "maxInputTokensInclusive",
      "inputPrice",
      "cachedInputPrice",
      "outputPrice",
      "observedAt",
      "staleAfter",
      "validThrough",
      "sourceUrl",
    ], path);
    const modelId = asNonEmptyString(entry.modelId, `${path}.modelId`);
    assertKnownModel(modelId, knownModelIds, `${path}.modelId`);
    const currency = asCurrencyCode(entry.currency, `${path}.currency`);
    const providerId = asProviderId(entry.providerId, `${path}.providerId`);
    if (entry.unit !== "per_1m_tokens") fail(`${path}.unit`, "expected per_1m_tokens");
    if (entry.billingMode !== "realtime") fail(`${path}.billingMode`, "expected realtime");
    const minInputTokensExclusive = asNonNegativeInteger(
      entry.minInputTokensExclusive,
      `${path}.minInputTokensExclusive`,
    );
    const maxInputTokensInclusive = asNullablePositiveInteger(
      entry.maxInputTokensInclusive,
      `${path}.maxInputTokensInclusive`,
    );
    if (maxInputTokensInclusive !== null && minInputTokensExclusive >= maxInputTokensInclusive) {
      fail(`${path}.maxInputTokensInclusive`, "must be greater than minInputTokensExclusive");
    }
    const observedAt = asIsoDate(entry.observedAt, `${path}.observedAt`);
    const staleAfter = asIsoDate(entry.staleAfter, `${path}.staleAfter`);
    const validThrough = asNullableIsoDate(entry.validThrough, `${path}.validThrough`);
    const expectedStaleAfter = addIsoDateDays(observedAt, PRICE_FRESHNESS_DAYS);
    if (staleAfter !== expectedStaleAfter) {
      fail(
        `${path}.staleAfter`,
        `must be exactly ${PRICE_FRESHNESS_DAYS} calendar days after observedAt (${expectedStaleAfter})`,
      );
    }
    if (validThrough !== null && validThrough < observedAt) {
      fail(`${path}.validThrough`, "must not be earlier than observedAt");
    }
    return {
      offerId: asStableId(entry.offerId, `${path}.offerId`),
      modelId,
      providerModelId: asNonEmptyString(entry.providerModelId, `${path}.providerModelId`),
      providerId,
      regionId: asRegionId(entry.regionId, `${path}.regionId`),
      currency,
      unit: "per_1m_tokens",
      billingMode: "realtime",
      minInputTokensExclusive,
      maxInputTokensInclusive,
      inputPrice: asNonNegativeNumber(entry.inputPrice, `${path}.inputPrice`),
      cachedInputPrice: asNullableNonNegativeNumber(entry.cachedInputPrice, `${path}.cachedInputPrice`),
      outputPrice: asNonNegativeNumber(entry.outputPrice, `${path}.outputPrice`),
      observedAt,
      staleAfter,
      validThrough,
      sourceUrl: asProviderHttpsUrl(entry.sourceUrl, `${path}.sourceUrl`, providerId),
    };
  });

  assertUniqueBy(
    entries,
    (entry) => [entry.offerId, entry.minInputTokensExclusive, entry.maxInputTokensInclusive ?? "unbounded"].join("|"),
    "pricing.json.entries",
  );

  const entriesByOffer = new Map<string, PricingEntry[]>();
  for (const entry of entries) {
    const offerEntries = entriesByOffer.get(entry.offerId) ?? [];
    offerEntries.push(entry);
    entriesByOffer.set(entry.offerId, offerEntries);
  }
  for (const [offerId, offerEntries] of entriesByOffer) {
    const first = offerEntries[0];
    const invariant = (entry: PricingEntry) => JSON.stringify([
      entry.modelId,
      entry.providerModelId,
      entry.providerId,
      entry.regionId,
      entry.currency,
      entry.unit,
      entry.billingMode,
      entry.observedAt,
      entry.staleAfter,
      entry.validThrough,
      entry.sourceUrl,
    ]);
    if (offerEntries.some((entry) => invariant(entry) !== invariant(first))) {
      fail("pricing.json.entries", `tiers for offer ${offerId} have inconsistent metadata`);
    }
    const tiers = [...offerEntries].sort(
      (left, right) => left.minInputTokensExclusive - right.minInputTokensExclusive,
    );
    if (tiers[0].minInputTokensExclusive !== 0) {
      fail("pricing.json.entries", `offer ${offerId} must start at 0 input tokens`);
    }
    for (let index = 1; index < tiers.length; index += 1) {
      const previousMax = tiers[index - 1].maxInputTokensInclusive;
      if (previousMax === null || tiers[index].minInputTokensExclusive !== previousMax) {
        fail("pricing.json.entries", `offer ${offerId} tiers must be contiguous and non-overlapping`);
      }
    }
  }
  assertUniqueBy(
    [...entriesByOffer.values()].map((offerEntries) => offerEntries[0]),
    (entry) => [
      entry.modelId,
      entry.providerModelId,
      entry.providerId,
      entry.regionId,
      entry.currency,
      entry.unit,
      entry.billingMode,
    ].join("|"),
    "pricing.json.entries offers",
  );
  return { schemaVersion: MODELOPS_SCHEMA_VERSION, entries };
}

export function sortPricingEntries(entries: PricingEntry[]): PricingEntry[] {
  return [...entries].sort((left, right) => {
    const identityOrder = compareStrings(
      [left.modelId, left.providerId, left.regionId, left.currency, left.offerId].join("|"),
      [right.modelId, right.providerId, right.regionId, right.currency, right.offerId].join("|"),
    );
    if (identityOrder !== 0) return identityOrder;
    if (left.minInputTokensExclusive !== right.minInputTokensExclusive) {
      return left.minInputTokensExclusive - right.minInputTokensExclusive;
    }
    if (left.maxInputTokensInclusive === right.maxInputTokensInclusive) return 0;
    if (left.maxInputTokensInclusive === null) return 1;
    if (right.maxInputTokensInclusive === null) return -1;
    return left.maxInputTokensInclusive - right.maxInputTokensInclusive;
  });
}

export function pricingEvidenceCutoff(entry: PricingEntry): string {
  return entry.validThrough !== null && entry.validThrough < entry.staleAfter
    ? entry.validThrough
    : entry.staleAfter;
}

export function isPricingEvidenceStale(entry: PricingEntry, asOf: string): boolean {
  const checkedDate = asIsoDate(asOf, "pricing asOf");
  return checkedDate > pricingEvidenceCutoff(entry);
}

export function parseProviderSourcesConfig(
  value: unknown,
  knownModelIds: ReadonlySet<string>,
): ProviderSourcesConfig {
  const root = asObject(value, "provider-sources.json");
  assertExactKeys(root, ["schemaVersion", "entries"], "provider-sources.json");
  assertSchemaVersion(root.schemaVersion, "provider-sources.json.schemaVersion");
  if (!Array.isArray(root.entries)) fail("provider-sources.json.entries", "expected an array");

  const entries = root.entries.map((item, index): ProviderSourceEntry => {
    const path = `provider-sources.json.entries[${index}]`;
    const entry = asObject(item, path);
    assertExactKeys(entry, ["modelId", "providerModelId", "providerId", "kind", "title", "url", "observedAt"], path);
    const modelId = asNonEmptyString(entry.modelId, `${path}.modelId`);
    assertKnownModel(modelId, knownModelIds, `${path}.modelId`);
    const providerId = asProviderId(entry.providerId, `${path}.providerId`);
    if (typeof entry.kind !== "string" || !PROVIDER_SOURCE_KINDS.has(entry.kind as ProviderSourceKind)) {
      fail(`${path}.kind`, "unsupported provider source kind");
    }
    return {
      modelId,
      providerModelId: asNonEmptyString(entry.providerModelId, `${path}.providerModelId`),
      providerId,
      kind: entry.kind as ProviderSourceKind,
      title: asNonEmptyString(entry.title, `${path}.title`),
      url: asProviderHttpsUrl(entry.url, `${path}.url`, providerId),
      observedAt: asIsoDate(entry.observedAt, `${path}.observedAt`),
    };
  });

  assertUniqueBy(
    entries,
    (entry) => [entry.modelId, entry.providerModelId, entry.providerId, entry.kind, entry.url].join("|"),
    "provider-sources.json.entries",
  );
  return { schemaVersion: MODELOPS_SCHEMA_VERSION, entries };
}

export function assertReviewedEvidenceBindings(
  aliases: ModelAliasConfig,
  pricing: PricingConfig,
  providerSources: ProviderSourcesConfig,
): void {
  const providerModelsByModel = new Map(
    aliases.models.map((entry) => [
      entry.modelId,
      new Set(entry.providerModels.map((binding) => `${binding.providerId}|${binding.providerModelId}`)),
    ]),
  );
  for (const entry of [...pricing.entries, ...providerSources.entries]) {
    const bindingKey = `${entry.providerId}|${entry.providerModelId}`;
    if (!providerModelsByModel.get(entry.modelId)?.has(bindingKey)) {
      fail(
        "reviewed evidence",
        `provider binding ${JSON.stringify(bindingKey)} is not registered for ${entry.modelId}`,
      );
    }
  }

  const allowlistedPricingSources = new Set(
    providerSources.entries
      .filter((entry) => entry.kind === "pricing")
      .map((entry) => [entry.modelId, entry.providerModelId, entry.providerId, entry.url, entry.observedAt].join("|")),
  );
  for (const entry of pricing.entries) {
    const sourceKey = [
      entry.modelId,
      entry.providerModelId,
      entry.providerId,
      entry.sourceUrl,
      entry.observedAt,
    ].join("|");
    if (!allowlistedPricingSources.has(sourceKey)) {
      fail(
        "reviewed evidence",
        `pricing source is not allowlisted for ${entry.modelId}/${entry.providerModelId}: ${entry.sourceUrl}`,
      );
    }
  }
}

export interface BenchmarkSourceObservation {
  benchmarkId: string;
  value: number;
  modelVersion: string;
  observedAt: string;
}

export interface ObjectiveSnapshotSource {
  [modelId: string]: {
    modelId: string;
    observations: Partial<Record<string, BenchmarkSourceObservation>>;
  };
}

export interface AaSnapshotSource {
  models: Record<string, Partial<Record<"intelligence" | "coding", {
    value: number;
    modelVersion: string;
    observedAt: string;
    sourceSlug: string;
  }>>>;
}

export interface ArenaSnapshotSource {
  models: Record<string, Partial<Record<ArenaDimension, { modelVersion: string }>>>;
}

/**
 * Proves that every benchmark row is tied to a reviewed exact-version identifier.
 * AA display labels are verified through their source slug; static benchmark and
 * Arena rows are verified through their respective exact-version registries.
 */
export function assertSourceVersionBindings(
  aliases: ModelAliasConfig,
  objectiveSnapshot: ObjectiveSnapshotSource,
  aaSnapshot: AaSnapshotSource,
  arenaSnapshot: ArenaSnapshotSource,
): void {
  const aliasesByModelId = new Map(aliases.models.map((entry) => [entry.modelId, entry]));
  const benchmarkByAaDimension = {
    intelligence: "aa-intelligence",
    coding: "aa-coding",
  } as const;

  for (const [modelId, metrics] of Object.entries(aaSnapshot.models)) {
    const modelAliases = aliasesByModelId.get(modelId);
    if (!modelAliases) fail("source bindings", `AA snapshot contains unknown modelId ${modelId}`);
    for (const dimension of ["intelligence", "coding"] as const) {
      const metric = metrics[dimension];
      if (!metric) continue;
      if (!modelAliases.aaSlugs.includes(metric.sourceSlug)) {
        fail(
          "source bindings",
          `AA sourceSlug ${JSON.stringify(metric.sourceSlug)} is not registered for ${modelId}`,
        );
      }
      const benchmarkId = benchmarkByAaDimension[dimension];
      const observation = objectiveSnapshot[modelId]?.observations[benchmarkId];
      if (!observation) fail("source bindings", `AA metric ${modelId}/${dimension} was not merged into ${benchmarkId}`);
      if (
        observation.benchmarkId !== benchmarkId
        || observation.value !== metric.value
        || observation.modelVersion !== metric.modelVersion
        || observation.observedAt !== metric.observedAt
      ) {
        fail("source bindings", `AA metric ${modelId}/${dimension} changed while merging into ${benchmarkId}`);
      }
    }
  }

  for (const [modelId, profile] of Object.entries(objectiveSnapshot)) {
    const modelAliases = aliasesByModelId.get(modelId);
    if (!modelAliases) fail("source bindings", `objective snapshot contains unknown modelId ${modelId}`);
    if (profile.modelId !== modelId) {
      fail("source bindings", `objective snapshot key ${modelId} does not match profile.modelId ${profile.modelId}`);
    }
    for (const [benchmarkId, observation] of Object.entries(profile.observations)) {
      if (!observation) continue;
      const aaDimension = benchmarkId === "aa-intelligence"
        ? "intelligence"
        : benchmarkId === "aa-coding"
          ? "coding"
          : null;
      if (aaDimension && aaSnapshot.models[modelId]?.[aaDimension]) continue;
      if (!modelAliases.benchmarkVersionIds.includes(observation.modelVersion)) {
        fail(
          "source bindings",
          `benchmark modelVersion ${JSON.stringify(observation.modelVersion)} is not registered for ${modelId}`,
        );
      }
    }
  }

  for (const [modelId, metrics] of Object.entries(arenaSnapshot.models)) {
    const modelAliases = aliasesByModelId.get(modelId);
    if (!modelAliases) fail("source bindings", `Arena snapshot contains unknown modelId ${modelId}`);
    for (const [dimension, metric] of Object.entries(metrics)) {
      if (!metric) continue;
      if (!modelAliases.arenaNames.includes(metric.modelVersion)) {
        fail(
          "source bindings",
          `Arena modelVersion ${JSON.stringify(metric.modelVersion)} is not registered for ${modelId}/${dimension}`,
        );
      }
    }
  }
}
