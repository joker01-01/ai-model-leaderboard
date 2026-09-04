export const AA_PUBLIC_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export interface AaPublicPagination {
  readonly pageSize: number;
  readonly totalPages: number;
  readonly declaredTotalRows: number | null;
  readonly fetchedRowCount: number;
}

export interface AaPublicSource {
  readonly url: string;
  readonly observedAt: string;
  readonly schemaFingerprint: string;
  readonly intelligenceIndexVersion: number;
  readonly pagination: AaPublicPagination;
}

export interface AaPublicModel {
  readonly sourceId: string;
  readonly sourceSlug: string | null;
  readonly rawName: string | null;
  readonly creatorId: string | null;
  readonly creatorName: string | null;
  readonly releaseDate: string | null;
  readonly observedAt: string;
  readonly intelligence: number | null;
  readonly coding: number | null;
  readonly agentic: number | null;
  readonly inputPricePerMillion: number | null;
  readonly outputPricePerMillion: number | null;
  readonly timeToFirstAnswerSeconds: number | null;
  readonly outputTokensPerSecond: number | null;
}

export interface AaPublicSnapshot {
  readonly schemaVersion: typeof AA_PUBLIC_SNAPSHOT_SCHEMA_VERSION;
  readonly source: AaPublicSource;
  readonly models: readonly AaPublicModel[];
}

const SNAPSHOT_KEYS = ["schemaVersion", "source", "models"] as const;
const SOURCE_KEYS = [
  "url",
  "observedAt",
  "schemaFingerprint",
  "intelligenceIndexVersion",
  "pagination",
] as const;
const PAGINATION_KEYS = ["pageSize", "totalPages", "declaredTotalRows", "fetchedRowCount"] as const;
const MODEL_KEYS = [
  "sourceId",
  "sourceSlug",
  "rawName",
  "creatorId",
  "creatorName",
  "releaseDate",
  "observedAt",
  "intelligence",
  "coding",
  "agentic",
  "inputPricePerMillion",
  "outputPricePerMillion",
  "timeToFirstAnswerSeconds",
  "outputTokensPerSecond",
] as const;

function strictObject(value: unknown, path: string, allowedKeys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }

  const record = value as Record<string, unknown>;
  const allowed = new Set(allowedKeys);
  const unknownKey = Object.keys(record).find((key) => !allowed.has(key));
  if (unknownKey !== undefined) {
    throw new Error(`${path}.${unknownKey} is not allowed`);
  }
  const missingKey = allowedKeys.find((key) => !Object.hasOwn(record, key));
  if (missingKey !== undefined) {
    throw new Error(`${path}.${missingKey} is required`);
  }
  return record;
}

function requiredTrimmedString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`${path} must be a non-empty trimmed string`);
  }
  return value;
}

function nullableTrimmedString(value: unknown, path: string): string | null {
  return value === null ? null : requiredTrimmedString(value, path);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function requiredDate(value: unknown, path: string): string {
  const date = requiredTrimmedString(value, path);
  if (!isIsoDate(date)) throw new Error(`${path} must be an ISO calendar date`);
  return date;
}

function nullableDate(value: unknown, path: string): string | null {
  return value === null ? null : requiredDate(value, path);
}

function requiredFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  return value;
}

function nullableFiniteNumber(value: unknown, path: string, nonNegative = false): number | null {
  if (value === null) return null;
  const parsed = requiredFiniteNumber(value, path);
  if (nonNegative && parsed < 0) throw new Error(`${path} must be non-negative or null`);
  return parsed;
}

function requiredInteger(value: unknown, path: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${path} must be a safe integer greater than or equal to ${minimum}`);
  }
  return value;
}

function nullableInteger(value: unknown, path: string, minimum: number): number | null {
  return value === null ? null : requiredInteger(value, path, minimum);
}

function requiredHttpsUrl(value: unknown, path: string): string {
  const raw = requiredTrimmedString(value, path);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${path} must be a valid HTTPS URL`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error(`${path} must be a credential-free HTTPS URL without a query or fragment`);
  }
  return raw;
}

function parsePagination(value: unknown): AaPublicPagination {
  const record = strictObject(value, "AA public snapshot.source.pagination", PAGINATION_KEYS);
  const totalPages = requiredInteger(record.totalPages, "AA public snapshot.source.pagination.totalPages", 1);
  if (totalPages > 50) {
    throw new Error("AA public snapshot.source.pagination.totalPages must be less than or equal to 50");
  }
  return {
    pageSize: requiredInteger(record.pageSize, "AA public snapshot.source.pagination.pageSize", 1),
    totalPages,
    declaredTotalRows: nullableInteger(
      record.declaredTotalRows,
      "AA public snapshot.source.pagination.declaredTotalRows",
      0,
    ),
    fetchedRowCount: requiredInteger(
      record.fetchedRowCount,
      "AA public snapshot.source.pagination.fetchedRowCount",
      1,
    ),
  };
}

function parseModel(value: unknown, index: number, snapshotObservedAt: string): AaPublicModel {
  const path = `AA public snapshot.models[${index}]`;
  const record = strictObject(value, path, MODEL_KEYS);
  const observedAt = requiredDate(record.observedAt, `${path}.observedAt`);
  if (observedAt !== snapshotObservedAt) {
    throw new Error(`${path}.observedAt must equal AA public snapshot.source.observedAt`);
  }

  return Object.freeze({
    sourceId: requiredTrimmedString(record.sourceId, `${path}.sourceId`),
    sourceSlug: nullableTrimmedString(record.sourceSlug, `${path}.sourceSlug`),
    rawName: nullableTrimmedString(record.rawName, `${path}.rawName`),
    creatorId: nullableTrimmedString(record.creatorId, `${path}.creatorId`),
    creatorName: nullableTrimmedString(record.creatorName, `${path}.creatorName`),
    releaseDate: nullableDate(record.releaseDate, `${path}.releaseDate`),
    observedAt,
    intelligence: nullableFiniteNumber(record.intelligence, `${path}.intelligence`),
    coding: nullableFiniteNumber(record.coding, `${path}.coding`),
    agentic: nullableFiniteNumber(record.agentic, `${path}.agentic`),
    inputPricePerMillion: nullableFiniteNumber(
      record.inputPricePerMillion,
      `${path}.inputPricePerMillion`,
      true,
    ),
    outputPricePerMillion: nullableFiniteNumber(
      record.outputPricePerMillion,
      `${path}.outputPricePerMillion`,
      true,
    ),
    timeToFirstAnswerSeconds: nullableFiniteNumber(
      record.timeToFirstAnswerSeconds,
      `${path}.timeToFirstAnswerSeconds`,
      true,
    ),
    outputTokensPerSecond: nullableFiniteNumber(
      record.outputTokensPerSecond,
      `${path}.outputTokensPerSecond`,
      true,
    ),
  });
}

export function parseAaPublicSnapshot(value: unknown): AaPublicSnapshot {
  const snapshot = strictObject(value, "AA public snapshot", SNAPSHOT_KEYS);
  if (snapshot.schemaVersion !== AA_PUBLIC_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`AA public snapshot.schemaVersion must equal ${AA_PUBLIC_SNAPSHOT_SCHEMA_VERSION}`);
  }

  const sourceRecord = strictObject(snapshot.source, "AA public snapshot.source", SOURCE_KEYS);
  const observedAt = requiredDate(sourceRecord.observedAt, "AA public snapshot.source.observedAt");
  const intelligenceIndexVersion = requiredFiniteNumber(
    sourceRecord.intelligenceIndexVersion,
    "AA public snapshot.source.intelligenceIndexVersion",
  );
  if (intelligenceIndexVersion <= 0) {
    throw new Error("AA public snapshot.source.intelligenceIndexVersion must be positive");
  }
  const pagination = parsePagination(sourceRecord.pagination);
  if (pagination.declaredTotalRows !== null) {
    throw new Error("AA public snapshot.source.pagination.declaredTotalRows must be null for the Free v2 source");
  }

  if (!Array.isArray(snapshot.models)) throw new Error("AA public snapshot.models must be an array");
  const models = snapshot.models.map((model, index) => parseModel(model, index, observedAt));
  const sourceIds = new Set<string>();
  let previousSourceId: string | null = null;
  for (const model of models) {
    if (sourceIds.has(model.sourceId)) {
      throw new Error(`AA public snapshot.models contains duplicate sourceId ${model.sourceId}`);
    }
    if (previousSourceId !== null && model.sourceId < previousSourceId) {
      throw new Error("AA public snapshot.models must be sorted by sourceId ascending");
    }
    sourceIds.add(model.sourceId);
    previousSourceId = model.sourceId;
  }

  if (pagination.fetchedRowCount !== models.length) {
    throw new Error("AA public snapshot pagination fetchedRowCount must equal models length");
  }
  const expectedPages = Math.max(1, Math.ceil(pagination.fetchedRowCount / pagination.pageSize));
  if (pagination.totalPages !== expectedPages) {
    throw new Error("AA public snapshot pagination totalPages is inconsistent with pageSize and fetchedRowCount");
  }

  const frozenPagination = Object.freeze(pagination);
  const source: AaPublicSource = Object.freeze({
    url: requiredHttpsUrl(sourceRecord.url, "AA public snapshot.source.url"),
    observedAt,
    schemaFingerprint: requiredTrimmedString(
      sourceRecord.schemaFingerprint,
      "AA public snapshot.source.schemaFingerprint",
    ),
    intelligenceIndexVersion,
    pagination: frozenPagination,
  });

  return Object.freeze({
    schemaVersion: AA_PUBLIC_SNAPSHOT_SCHEMA_VERSION,
    source,
    models: Object.freeze(models),
  });
}
