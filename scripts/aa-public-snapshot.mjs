import { createHash } from "node:crypto";

export const AA_PUBLIC_SCHEMA_VERSION = 1;
export const AA_PUBLIC_SOURCE_URL = "https://artificialanalysis.ai/api/v2/language/models/free";
export const AA_PUBLIC_METRIC_FIELDS = Object.freeze([
  "intelligence",
  "coding",
  "agentic",
  "inputPricePerMillion",
  "outputPricePerMillion",
  "timeToFirstAnswerSeconds",
  "outputTokensPerSecond",
]);

const IDENTITY_FIELDS = Object.freeze([
  "sourceSlug",
  "rawName",
  "creatorId",
  "creatorName",
  "releaseDate",
]);

const MODEL_FIELDS = Object.freeze([
  "sourceId",
  ...IDENTITY_FIELDS,
  "observedAt",
  ...AA_PUBLIC_METRIC_FIELDS,
]);

const NON_NEGATIVE_METRIC_FIELDS = new Set([
  "inputPricePerMillion",
  "outputPricePerMillion",
  "timeToFirstAnswerSeconds",
  "outputTokensPerSecond",
]);
const AA_API_TIERS = new Set(["free", "pro", "commercial"]);

const WIRE_METRICS = Object.freeze({
  intelligence: ["evaluations", "artificial_analysis_intelligence_index"],
  coding: ["evaluations", "artificial_analysis_coding_index"],
  agentic: ["evaluations", "artificial_analysis_agentic_index"],
  inputPricePerMillion: ["pricing", "price_1m_input_tokens"],
  outputPricePerMillion: ["pricing", "price_1m_output_tokens"],
  timeToFirstAnswerSeconds: ["performance", "median_time_to_first_answer_token_seconds"],
  outputTokensPerSecond: ["performance", "median_output_tokens_per_second"],
});

// This descriptor fingerprints the selected Free v2 wire contract. Optional
// source fields outside this projection do not leak into the public snapshot.
const AA_FREE_V2_SCHEMA_DESCRIPTOR = Object.freeze({
  response: ["tier", "intelligence_index_version", "pagination", "data"],
  pagination: ["page", "page_size", "total_pages", "has_more"],
  model: [
    "id",
    "name",
    "slug",
    "release_date",
    "model_creator",
    "evaluations",
    "pricing",
    "performance",
  ],
  modelCreator: ["id", "name"],
  metrics: WIRE_METRICS,
  nullSemantics: "null-or-missing-means-unavailable; numeric-zero-is-valid",
});

export const AA_FREE_V2_SCHEMA_FINGERPRINT = `sha256:${createHash("sha256")
  .update(canonicalJson(AA_FREE_V2_SCHEMA_DESCRIPTOR))
  .digest("hex")}`;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort(compareStrings)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, expected, path) {
  const actual = Object.keys(value).sort(compareStrings);
  const wanted = [...expected].sort(compareStrings);
  if (canonicalJson(actual) !== canonicalJson(wanted)) {
    throw new Error(`${path} has missing or unexpected fields`);
  }
}

function requiredTrimmedString(value, path) {
  if (typeof value !== "string" || value === "" || value.trim() !== value) {
    throw new Error(`${path} must be a non-empty trimmed string`);
  }
  return value;
}

function nullableIdentityString(value, path) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string or null`);
  }
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function isoDate(value, path, nullable = true) {
  if (value === null || value === undefined || value === "") {
    if (nullable) return null;
    throw new Error(`${path} must be an ISO date`);
  }
  const date = requiredTrimmedString(value, path);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || Number.isNaN(parsed.valueOf())
    || parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`${path} must be an ISO date${nullable ? " or null" : ""}`);
  }
  return date;
}

function positiveInteger(value, path) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${path} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative safe integer`);
  }
  return value;
}

function nullableMetric(value, path, nonNegative) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number or null`);
  }
  if (nonNegative && value < 0) {
    throw new Error(`${path} must be non-negative or null`);
  }
  return value;
}

function optionalObject(value, path) {
  if (value === null || value === undefined) return null;
  if (!isObject(value)) throw new Error(`${path} must be an object or null`);
  return value;
}

function readWireMetric(row, field, path) {
  const [containerName, wireName] = WIRE_METRICS[field];
  const container = optionalObject(row[containerName], `${path}.${containerName}`);
  const value = container === null ? null : container[wireName];
  return nullableMetric(value, `${path}.${containerName}.${wireName}`, NON_NEGATIVE_METRIC_FIELDS.has(field));
}

function normalizeSourceUrl(value) {
  const sourceUrl = requiredTrimmedString(value, "AA public sourceUrl");
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error("AA public sourceUrl must be a valid HTTPS URL");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.hash !== ""
    || parsed.search !== ""
  ) {
    throw new Error("AA public sourceUrl must be a credential-free HTTPS URL without query or fragment");
  }
  return parsed.toString();
}

function normalizeCreator(value, path) {
  const creator = optionalObject(value, path);
  if (creator === null) return { creatorId: null, creatorName: null };
  return {
    creatorId: nullableIdentityString(creator.id, `${path}.id`),
    creatorName: nullableIdentityString(creator.name, `${path}.name`),
  };
}

function normalizeWireRow(row, index, observedAt) {
  const path = `AA row ${index}`;
  if (!isObject(row)) throw new Error(`${path} must be an object`);
  const sourceId = requiredTrimmedString(row.id, `${path}.id`);
  const creator = normalizeCreator(row.model_creator, `${path}.model_creator`);
  const normalized = {
    sourceId,
    sourceSlug: nullableIdentityString(row.slug, `${path}.slug`),
    rawName: nullableIdentityString(row.name, `${path}.name`),
    ...creator,
    releaseDate: isoDate(row.release_date, `${path}.release_date`),
    observedAt,
  };
  for (const field of AA_PUBLIC_METRIC_FIELDS) {
    normalized[field] = readWireMetric(row, field, path);
  }
  return normalized;
}

function normalizePagination(pages) {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error("AA pages must be a non-empty array");
  }

  let tier = null;
  let intelligenceIndexVersion = null;
  let pageSize = null;
  let totalPages = null;
  const rows = [];

  for (const [index, payload] of pages.entries()) {
    const pageNumber = index + 1;
    const path = `AA page ${pageNumber}`;
    if (!isObject(payload)) throw new Error(`${path} must be an object`);
    if (!AA_API_TIERS.has(payload.tier)) {
      throw new Error(`${path}.tier must be free, pro, or commercial`);
    }
    if (tier !== null && payload.tier !== tier) {
      throw new Error(`AA tier changed during pagination: ${tier} -> ${payload.tier}`);
    }
    tier = payload.tier;

    const version = payload.intelligence_index_version;
    if (typeof version !== "number" || !Number.isFinite(version) || version <= 0) {
      throw new Error(`${path}.intelligence_index_version must be a positive finite number`);
    }
    if (intelligenceIndexVersion !== null && version !== intelligenceIndexVersion) {
      throw new Error(
        `AA intelligence index version changed during pagination: ${intelligenceIndexVersion} -> ${version}`,
      );
    }
    intelligenceIndexVersion = version;

    if (!isObject(payload.pagination)) throw new Error(`${path}.pagination must be an object`);
    const pagination = payload.pagination;
    const currentPage = positiveInteger(pagination.page, `${path}.pagination.page`);
    const currentPageSize = positiveInteger(pagination.page_size, `${path}.pagination.page_size`);
    const currentTotalPages = positiveInteger(pagination.total_pages, `${path}.pagination.total_pages`);
    if (currentTotalPages > 50) throw new Error("AA pagination exceeds the 50-page safety limit");
    if (currentPage !== pageNumber) {
      throw new Error(`${path}.pagination.page must equal ${pageNumber}`);
    }
    if (typeof pagination.has_more !== "boolean") {
      throw new Error(`${path}.pagination.has_more must be a boolean`);
    }
    if (pagination.has_more !== (currentPage < currentTotalPages)) {
      throw new Error(`${path}.pagination.has_more is inconsistent with total_pages`);
    }
    if (pageSize !== null && currentPageSize !== pageSize) {
      throw new Error(`AA page_size changed during pagination: ${pageSize} -> ${currentPageSize}`);
    }
    if (totalPages !== null && currentTotalPages !== totalPages) {
      throw new Error(`AA total_pages changed during pagination: ${totalPages} -> ${currentTotalPages}`);
    }
    pageSize = currentPageSize;
    totalPages = currentTotalPages;

    if (!Array.isArray(payload.data)) throw new Error(`${path}.data must be an array`);
    if (payload.data.length === 0) throw new Error(`${path}.data must not be empty`);
    if (payload.data.length > currentPageSize) {
      throw new Error(`${path}.data exceeds page_size`);
    }
    if (pagination.has_more && payload.data.length !== currentPageSize) {
      throw new Error(`${path}.data must fill page_size while has_more is true`);
    }
    rows.push(...payload.data);
  }

  if (pages.length !== totalPages) {
    throw new Error(`AA pagination stopped after ${pages.length} of ${totalPages} pages`);
  }

  return {
    intelligenceIndexVersion,
    pagination: {
      pageSize,
      totalPages,
      // The documented Free v2 pagination shape exposes no total-row field.
      declaredTotalRows: null,
      fetchedRowCount: rows.length,
    },
    rows,
  };
}

function validateNormalizedModel(value, index, observedAt) {
  const path = `AA public snapshot.models[${index}]`;
  if (!isObject(value)) throw new Error(`${path} must be an object`);
  assertExactKeys(value, MODEL_FIELDS, path);
  const model = {
    sourceId: requiredTrimmedString(value.sourceId, `${path}.sourceId`),
    sourceSlug: nullableIdentityString(value.sourceSlug, `${path}.sourceSlug`),
    rawName: nullableIdentityString(value.rawName, `${path}.rawName`),
    creatorId: nullableIdentityString(value.creatorId, `${path}.creatorId`),
    creatorName: nullableIdentityString(value.creatorName, `${path}.creatorName`),
    releaseDate: isoDate(value.releaseDate, `${path}.releaseDate`),
    observedAt: isoDate(value.observedAt, `${path}.observedAt`, false),
  };
  if (model.observedAt !== observedAt) {
    throw new Error(`${path}.observedAt must match source.observedAt`);
  }
  for (const field of AA_PUBLIC_METRIC_FIELDS) {
    model[field] = nullableMetric(value[field], `${path}.${field}`, NON_NEGATIVE_METRIC_FIELDS.has(field));
  }
  return model;
}

/**
 * Validates and canonicalizes an already normalized public snapshot.
 * The returned storage order is sourceId ascending; leaderboard order belongs
 * to pure frontend/backend selectors rather than generated data.
 */
export function validateAaPublicSnapshot(value) {
  if (!isObject(value)) throw new Error("AA public snapshot must be an object");
  assertExactKeys(value, ["schemaVersion", "source", "models"], "AA public snapshot");
  if (value.schemaVersion !== AA_PUBLIC_SCHEMA_VERSION) {
    throw new Error(`AA public snapshot.schemaVersion must equal ${AA_PUBLIC_SCHEMA_VERSION}`);
  }
  if (!isObject(value.source)) throw new Error("AA public snapshot.source must be an object");
  assertExactKeys(
    value.source,
    ["url", "observedAt", "schemaFingerprint", "intelligenceIndexVersion", "pagination"],
    "AA public snapshot.source",
  );
  const source = {
    url: normalizeSourceUrl(value.source.url),
    observedAt: isoDate(value.source.observedAt, "AA public snapshot.source.observedAt", false),
    schemaFingerprint: requiredTrimmedString(
      value.source.schemaFingerprint,
      "AA public snapshot.source.schemaFingerprint",
    ),
    intelligenceIndexVersion: value.source.intelligenceIndexVersion,
  };
  if (source.schemaFingerprint !== AA_FREE_V2_SCHEMA_FINGERPRINT) {
    throw new Error("AA public snapshot.source.schemaFingerprint is unsupported");
  }
  if (
    typeof source.intelligenceIndexVersion !== "number"
    || !Number.isFinite(source.intelligenceIndexVersion)
    || source.intelligenceIndexVersion <= 0
  ) {
    throw new Error("AA public snapshot.source.intelligenceIndexVersion must be a positive finite number");
  }
  if (!isObject(value.source.pagination)) {
    throw new Error("AA public snapshot.source.pagination must be an object");
  }
  assertExactKeys(
    value.source.pagination,
    ["pageSize", "totalPages", "declaredTotalRows", "fetchedRowCount"],
    "AA public snapshot.source.pagination",
  );
  const pagination = {
    pageSize: positiveInteger(value.source.pagination.pageSize, "AA public snapshot.source.pagination.pageSize"),
    totalPages: positiveInteger(
      value.source.pagination.totalPages,
      "AA public snapshot.source.pagination.totalPages",
    ),
    declaredTotalRows: value.source.pagination.declaredTotalRows,
    fetchedRowCount: nonNegativeInteger(
      value.source.pagination.fetchedRowCount,
      "AA public snapshot.source.pagination.fetchedRowCount",
    ),
  };
  if (pagination.totalPages > 50) {
    throw new Error("AA public snapshot pagination exceeds the 50-page safety limit");
  }
  if (pagination.declaredTotalRows !== null) {
    throw new Error("AA public snapshot.source.pagination.declaredTotalRows must be null for Free v2");
  }
  if (pagination.fetchedRowCount === 0) {
    throw new Error("AA public snapshot.source.pagination.fetchedRowCount must be positive");
  }
  if (pagination.fetchedRowCount > pagination.pageSize * pagination.totalPages) {
    throw new Error("AA public snapshot fetched rows exceed pagination capacity");
  }
  if (
    pagination.totalPages > 1
    && pagination.fetchedRowCount <= pagination.pageSize * (pagination.totalPages - 1)
  ) {
    throw new Error("AA public snapshot fetched rows do not prove the final page was reached");
  }
  if (!Array.isArray(value.models)) throw new Error("AA public snapshot.models must be an array");
  if (value.models.length !== pagination.fetchedRowCount) {
    throw new Error("AA public snapshot models length must equal fetchedRowCount");
  }

  const sourceIds = new Set();
  const models = value.models.map((model, index) => {
    const normalized = validateNormalizedModel(model, index, source.observedAt);
    if (sourceIds.has(normalized.sourceId)) {
      throw new Error(`AA public snapshot contains duplicate sourceId ${JSON.stringify(normalized.sourceId)}`);
    }
    sourceIds.add(normalized.sourceId);
    return normalized;
  }).sort((left, right) => compareStrings(left.sourceId, right.sourceId));

  return {
    schemaVersion: AA_PUBLIC_SCHEMA_VERSION,
    source: { ...source, pagination },
    models,
  };
}

/** Builds a reviewable report from the normalized snapshot contract. */
export function buildAaPublicReport(snapshotValue) {
  const snapshot = validateAaPublicSnapshot(snapshotValue);
  const finiteMetricCounts = Object.fromEntries(
    AA_PUBLIC_METRIC_FIELDS.map((field) => [
      field,
      snapshot.models.reduce((count, model) => count + (model[field] === null ? 0 : 1), 0),
    ]),
  );
  const missingIdentity = Object.fromEntries(IDENTITY_FIELDS.map((field) => {
    const sourceIds = snapshot.models
      .filter((model) => model[field] === null)
      .map((model) => model.sourceId);
    return [field, { count: sourceIds.length, sourceIds }];
  }));

  return {
    schemaVersion: AA_PUBLIC_SCHEMA_VERSION,
    source: {
      url: snapshot.source.url,
      observedAt: snapshot.source.observedAt,
      schemaFingerprint: snapshot.source.schemaFingerprint,
      intelligenceIndexVersion: snapshot.source.intelligenceIndexVersion,
    },
    pagination: snapshot.source.pagination,
    rowCount: snapshot.models.length,
    finiteMetricCounts,
    missingIdentity,
  };
}

/**
 * Validates every supplied Free v2 page and returns the one canonical public
 * snapshot plus its review report. This function performs no I/O.
 */
export function buildAaPublicSnapshot(
  pages,
  { observedAt, sourceUrl = AA_PUBLIC_SOURCE_URL } = {},
) {
  const normalizedObservedAt = isoDate(observedAt, "AA public observedAt", false);
  const normalizedSourceUrl = normalizeSourceUrl(sourceUrl);
  const pageResult = normalizePagination(pages);
  const models = pageResult.rows.map((row, index) => normalizeWireRow(row, index, normalizedObservedAt));
  const sourceIds = new Set();
  for (const model of models) {
    if (sourceIds.has(model.sourceId)) {
      throw new Error(`AA pages contain duplicate sourceId ${JSON.stringify(model.sourceId)}`);
    }
    sourceIds.add(model.sourceId);
  }

  const snapshot = validateAaPublicSnapshot({
    schemaVersion: AA_PUBLIC_SCHEMA_VERSION,
    source: {
      url: normalizedSourceUrl,
      observedAt: normalizedObservedAt,
      schemaFingerprint: AA_FREE_V2_SCHEMA_FINGERPRINT,
      intelligenceIndexVersion: pageResult.intelligenceIndexVersion,
      pagination: pageResult.pagination,
    },
    models,
  });
  return { snapshot, report: buildAaPublicReport(snapshot) };
}

/** Renders the generated TypeScript module without writing it to disk. */
export function renderAaPublicSnapshotModule(snapshotValue) {
  const snapshot = validateAaPublicSnapshot(snapshotValue);
  return `/** Generated by \`npm run sync:data\`; do not edit by hand. */
export interface AaPublicPagination {
  pageSize: number;
  totalPages: number;
  declaredTotalRows: number | null;
  fetchedRowCount: number;
}

export interface AaPublicSource {
  url: string;
  observedAt: string;
  schemaFingerprint: string;
  intelligenceIndexVersion: number;
  pagination: AaPublicPagination;
}

export interface AaPublicModel {
  sourceId: string;
  sourceSlug: string | null;
  rawName: string | null;
  creatorId: string | null;
  creatorName: string | null;
  releaseDate: string | null;
  observedAt: string;
  intelligence: number | null;
  coding: number | null;
  agentic: number | null;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  timeToFirstAnswerSeconds: number | null;
  outputTokensPerSecond: number | null;
}

export interface AaPublicSnapshot {
  schemaVersion: 1;
  source: AaPublicSource;
  models: readonly AaPublicModel[];
}

export const AA_PUBLIC_SNAPSHOT: AaPublicSnapshot = ${JSON.stringify(snapshot, null, 2)};
`;
}
