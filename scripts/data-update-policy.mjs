import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AA_LEADERBOARD_LIMIT } from "./aa-leaderboard.mjs";
import { renderAaPublicSnapshotModule } from "./aa-public-snapshot.mjs";
import { renderLegacySnapshotModule } from "./generated-snapshot-module.mjs";

export const ALLOWED_DATA_UPDATE_PATHS = Object.freeze([
  "data/aa/generated/snapshot.json",
  "data/aa/generated/sync-report.json",
  "data/modelops/generated/catalog.json",
  "data/modelops/generated/evidence.json",
  "data/sync-report.json",
  "src/data/generated/aaPublicSnapshot.ts",
  "src/data/generated/aaSnapshot.ts",
  "src/data/generated/arenaSnapshot.ts",
]);

const ALLOWED_PATHS = new Set(ALLOWED_DATA_UPDATE_PATHS);
const AA_PUBLIC_DATA_UPDATE_PATHS = Object.freeze([
  "data/aa/generated/snapshot.json",
  "data/aa/generated/sync-report.json",
  "src/data/generated/aaPublicSnapshot.ts",
]);
const AA_PUBLIC_PATHS = new Set(AA_PUBLIC_DATA_UPDATE_PATHS);
const AA_PUBLIC_METRICS = Object.freeze([
  "intelligence",
  "coding",
  "agentic",
  "inputPricePerMillion",
  "outputPricePerMillion",
  "timeToFirstAnswerSeconds",
  "outputTokensPerSecond",
]);
const AA_PUBLIC_NON_NEGATIVE_METRICS = new Set([
  "inputPricePerMillion",
  "outputPricePerMillion",
  "timeToFirstAnswerSeconds",
  "outputTokensPerSecond",
]);
const AA_PUBLIC_IDENTITY_FIELDS = Object.freeze([
  "sourceSlug",
  "rawName",
  "creatorId",
  "creatorName",
  "releaseDate",
]);
const AA_PUBLIC_SNAPSHOT_FIELDS = Object.freeze(["models", "schemaVersion", "source"]);
const AA_PUBLIC_SOURCE_FIELDS = Object.freeze([
  "intelligenceIndexVersion",
  "observedAt",
  "pagination",
  "schemaFingerprint",
  "url",
]);
const AA_PUBLIC_PAGINATION_FIELDS = Object.freeze([
  "declaredTotalRows",
  "fetchedRowCount",
  "pageSize",
  "totalPages",
]);
const AA_PUBLIC_MODEL_FIELDS = Object.freeze([
  ...AA_PUBLIC_METRICS,
  ...AA_PUBLIC_IDENTITY_FIELDS,
  "observedAt",
  "sourceId",
].sort());
const AA_PUBLIC_REPORT_FIELDS = Object.freeze([
  "finiteMetricCounts",
  "missingIdentity",
  "pagination",
  "rowCount",
  "schemaVersion",
  "source",
]);
const AA_PUBLIC_REPORT_SOURCE_FIELDS = Object.freeze([
  "intelligenceIndexVersion",
  "observedAt",
  "schemaFingerprint",
  "url",
]);
const AA_PUBLIC_MISSING_IDENTITY_ENTRY_FIELDS = Object.freeze(["count", "sourceIds"]);
const AA_BENCHMARK_IDS = new Set(["aa-coding", "aa-intelligence"]);
const AA_METRICS = new Set(["coding", "intelligence"]);
const AA_LEADERBOARD_FIELDS = [
  "creatorId",
  "creatorName",
  "modelVersion",
  "observedAt",
  "releaseDate",
  "sourceId",
  "sourceSlug",
  "value",
];
const MODIFIED_STATUSES = new Set(["M", "modified"]);
const ADDED_STATUSES = new Set(["A", "added"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addReason(reasons, reason) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function parseGeneratedSnapshotModule(source, constantName) {
  if (typeof source !== "string" || typeof constantName !== "string" || constantName === "") {
    throw new TypeError("generated snapshot source and constant name must be non-empty strings");
  }
  const declaration = `export const ${constantName}`;
  const declarationIndex = source.indexOf(declaration);
  if (declarationIndex === -1) throw new Error(`missing ${declaration} declaration`);
  const equalsIndex = source.indexOf("=", declarationIndex + declaration.length);
  if (equalsIndex === -1) throw new Error(`missing ${constantName} initializer`);
  const initializer = source.slice(equalsIndex + 1).trim();
  if (!initializer.endsWith(";")) throw new Error(`${constantName} initializer must end with a semicolon`);
  const parsed = JSON.parse(initializer.slice(0, -1));
  const canonicalSource = constantName === "AA_PUBLIC_SNAPSHOT"
    ? renderAaPublicSnapshotModule(parsed)
    : new Set(["AA_SNAPSHOT", "ARENA_SNAPSHOT"]).has(constantName)
      ? renderLegacySnapshotModule(constantName, parsed)
      : null;
  const normalizedSource = source.replaceAll("\r\n", "\n");
  if (canonicalSource !== null && normalizedSource !== canonicalSource) {
    throw new Error(`${constantName} module must match the canonical generated form`);
  }
  return parsed;
}

function readStringSet(value, path, reasons) {
  if (!Array.isArray(value)) {
    addReason(reasons, `${path} must be an array`);
    return null;
  }

  const result = new Set();
  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "") {
      addReason(reasons, `${path} must contain only non-empty strings`);
      return null;
    }
    if (result.has(item)) addReason(reasons, `${path} must not contain duplicates`);
    result.add(item);
  }
  return result;
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((item) => right.has(item));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isNullableFiniteNumber(value) {
  return value === null || isFiniteNumber(value);
}

function hasExactFields(value, fields, path, reasons) {
  if (!isObject(value)) {
    addReason(reasons, `${path} must be an object`);
    return false;
  }
  const actual = Object.keys(value).sort();
  if (canonicalJson(actual) !== canonicalJson([...fields].sort())) {
    addReason(reasons, `${path} has missing or unexpected fields`);
    return false;
  }
  return true;
}

function isNonEmptyTrimmedString(value) {
  return typeof value === "string" && value.trim() !== "" && value.trim() === value;
}

function isPlainHttpsUrl(value) {
  if (!isNonEmptyTrimmedString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.username === ""
      && url.password === ""
      && url.search === ""
      && url.hash === "";
  } catch {
    return false;
  }
}

function getChangePath(change) {
  return typeof change?.path === "string" ? change.path : change?.filename;
}

function checkChanges(changes, reasons) {
  if (!Array.isArray(changes) || changes.length === 0) {
    addReason(reasons, "changes must contain at least one modified generated file");
    return;
  }

  const seen = new Set();
  for (const [index, change] of changes.entries()) {
    if (!isObject(change)) {
      addReason(reasons, `changes[${index}] must be an object`);
      continue;
    }
    const path = getChangePath(change);
    if (typeof path !== "string" || path === "") {
      addReason(reasons, `changes[${index}] must include path or filename`);
      continue;
    }
    if (seen.has(path)) addReason(reasons, `duplicate changed path: ${path}`);
    seen.add(path);
    if (!ALLOWED_PATHS.has(path)) addReason(reasons, `changed path is not allowed: ${path}`);
    const allowedStatus = MODIFIED_STATUSES.has(change.status)
      || (AA_PUBLIC_PATHS.has(path) && ADDED_STATUSES.has(change.status));
    if (!allowedStatus) {
      addReason(reasons, `changed path must be modified, not ${String(change.status)}: ${path}`);
    }
  }
}

function validateAaPublicPagination(pagination, path, reasons) {
  if (!hasExactFields(pagination, AA_PUBLIC_PAGINATION_FIELDS, path, reasons)) return null;

  if (!Number.isSafeInteger(pagination.pageSize) || pagination.pageSize <= 0) {
    addReason(reasons, `${path}.pageSize must be a positive safe integer`);
  }
  if (!Number.isSafeInteger(pagination.totalPages) || pagination.totalPages <= 0 || pagination.totalPages > 50) {
    addReason(reasons, `${path}.totalPages must be a safe integer from 1 through 50`);
  }
  if (!Number.isSafeInteger(pagination.fetchedRowCount) || pagination.fetchedRowCount <= 0) {
    addReason(reasons, `${path}.fetchedRowCount must be a positive safe integer`);
  }
  if (pagination.declaredTotalRows !== null) {
    addReason(reasons, `${path}.declaredTotalRows must be null for Free v2`);
  }

  if (
    Number.isSafeInteger(pagination.pageSize)
    && pagination.pageSize > 0
    && Number.isSafeInteger(pagination.totalPages)
    && pagination.totalPages > 0
    && Number.isSafeInteger(pagination.fetchedRowCount)
    && pagination.fetchedRowCount >= 0
  ) {
    const maximumRows = pagination.pageSize * pagination.totalPages;
    const minimumRows = pagination.totalPages === 1
      ? 0
      : pagination.pageSize * (pagination.totalPages - 1) + 1;
    if (pagination.fetchedRowCount < minimumRows || pagination.fetchedRowCount > maximumRows) {
      addReason(reasons, `${path} does not prove complete pagination`);
    }
  }

  return pagination;
}

function validateAaPublicSnapshot(snapshot, path, reasons) {
  if (!hasExactFields(snapshot, AA_PUBLIC_SNAPSHOT_FIELDS, path, reasons)) return null;

  if (!Number.isInteger(snapshot.schemaVersion) || snapshot.schemaVersion <= 0) {
    addReason(reasons, `${path}.schemaVersion must be a positive integer`);
  }

  const sourcePath = `${path}.source`;
  const source = hasExactFields(snapshot.source, AA_PUBLIC_SOURCE_FIELDS, sourcePath, reasons)
    ? snapshot.source
    : null;
  if (source) {
    if (!isPlainHttpsUrl(source.url)) {
      addReason(reasons, `${sourcePath}.url must be HTTPS without credentials, query, or fragment`);
    }
    if (!isIsoDate(source.observedAt)) {
      addReason(reasons, `${sourcePath}.observedAt must be an ISO date`);
    }
    if (!isNonEmptyTrimmedString(source.schemaFingerprint)) {
      addReason(reasons, `${sourcePath}.schemaFingerprint must be a non-empty string`);
    }
    if (!isFiniteNumber(source.intelligenceIndexVersion) || source.intelligenceIndexVersion <= 0) {
      addReason(reasons, `${sourcePath}.intelligenceIndexVersion must be a positive finite number`);
    }
  }

  const pagination = source
    ? validateAaPublicPagination(source.pagination, `${sourcePath}.pagination`, reasons)
    : null;
  if (!Array.isArray(snapshot.models)) {
    addReason(reasons, `${path}.models must be an array`);
    return null;
  }

  const finiteMetricCounts = Object.fromEntries(AA_PUBLIC_METRICS.map((metric) => [metric, 0]));
  const missingIdentity = Object.fromEntries(AA_PUBLIC_IDENTITY_FIELDS.map((field) => [field, []]));
  const metadataBySourceId = new Map();
  const sourceIds = new Set();
  let previousSourceId = null;

  for (const [index, model] of snapshot.models.entries()) {
    const modelPath = `${path}.models[${index}]`;
    if (!hasExactFields(model, AA_PUBLIC_MODEL_FIELDS, modelPath, reasons)) continue;

    if (!isNonEmptyTrimmedString(model.sourceId)) {
      addReason(reasons, `${modelPath}.sourceId must be a non-empty string`);
    } else {
      if (sourceIds.has(model.sourceId)) {
        addReason(reasons, `${path}.models contains duplicate sourceId ${JSON.stringify(model.sourceId)}`);
      }
      sourceIds.add(model.sourceId);
      if (previousSourceId !== null && previousSourceId > model.sourceId) {
        addReason(reasons, `${path}.models must be ordered by sourceId`);
      }
      previousSourceId = model.sourceId;
    }

    for (const field of ["sourceSlug", "rawName", "creatorId", "creatorName"]) {
      if (model[field] !== null && !isNonEmptyTrimmedString(model[field])) {
        addReason(reasons, `${modelPath}.${field} must be a non-empty string or null`);
      }
      if (model[field] === null && isNonEmptyTrimmedString(model.sourceId)) {
        missingIdentity[field].push(model.sourceId);
      }
    }
    if (model.releaseDate !== null && !isIsoDate(model.releaseDate)) {
      addReason(reasons, `${modelPath}.releaseDate must be an ISO date or null`);
    }
    if (model.releaseDate === null && isNonEmptyTrimmedString(model.sourceId)) {
      missingIdentity.releaseDate.push(model.sourceId);
    }
    if (!isIsoDate(model.observedAt)) {
      addReason(reasons, `${modelPath}.observedAt must be an ISO date`);
    } else if (source && model.observedAt !== source.observedAt) {
      addReason(reasons, `${modelPath}.observedAt must equal ${sourcePath}.observedAt`);
    }

    for (const metric of AA_PUBLIC_METRICS) {
      const value = model[metric];
      if (!isNullableFiniteNumber(value)) {
        addReason(reasons, `${modelPath}.${metric} must be null or finite`);
        continue;
      }
      if (isFiniteNumber(value)) {
        finiteMetricCounts[metric] += 1;
        if (AA_PUBLIC_NON_NEGATIVE_METRICS.has(metric) && value < 0) {
          addReason(reasons, `${modelPath}.${metric} must be non-negative`);
        }
      }
    }

    if (isNonEmptyTrimmedString(model.sourceId)) {
      metadataBySourceId.set(model.sourceId, canonicalJson(Object.fromEntries(
        AA_PUBLIC_IDENTITY_FIELDS.map((field) => [field, model[field]]),
      )));
    }
  }

  if (pagination && pagination.fetchedRowCount !== snapshot.models.length) {
    addReason(reasons, `${sourcePath}.pagination.fetchedRowCount must equal models.length`);
  }

  if (!source || !pagination) return null;

  return {
    finiteMetricCounts,
    metadataBySourceId,
    missingIdentity,
    pagination,
    rowCount: snapshot.models.length,
    snapshot,
  };
}

function validateAaPublicReport(report, snapshotSummary, path, reasons) {
  if (!hasExactFields(report, AA_PUBLIC_REPORT_FIELDS, path, reasons)) return;
  if (!snapshotSummary) {
    addReason(reasons, `${path} cannot be checked without a valid public AA snapshot`);
    return;
  }

  const { snapshot } = snapshotSummary;
  if (report.schemaVersion !== snapshot.schemaVersion) {
    addReason(reasons, `${path}.schemaVersion must equal the public AA snapshot schemaVersion`);
  }
  if (!hasExactFields(report.source, AA_PUBLIC_REPORT_SOURCE_FIELDS, `${path}.source`, reasons)) return;
  const expectedReportSource = {
    intelligenceIndexVersion: snapshot.source.intelligenceIndexVersion,
    observedAt: snapshot.source.observedAt,
    schemaFingerprint: snapshot.source.schemaFingerprint,
    url: snapshot.source.url,
  };
  if (canonicalJson(report.source) !== canonicalJson(expectedReportSource)) {
    addReason(reasons, `${path}.source is inconsistent with the public AA snapshot`);
  }

  if (!hasExactFields(report.pagination, AA_PUBLIC_PAGINATION_FIELDS, `${path}.pagination`, reasons)) return;
  if (canonicalJson(report.pagination) !== canonicalJson(snapshot.source.pagination)) {
    addReason(reasons, `${path}.pagination is inconsistent with the public AA snapshot`);
  }
  if (!Number.isSafeInteger(report.rowCount) || report.rowCount < 0) {
    addReason(reasons, `${path}.rowCount must be a non-negative safe integer`);
  } else if (report.rowCount !== snapshotSummary.rowCount) {
    addReason(reasons, `${path}.rowCount is inconsistent with the public AA snapshot`);
  }

  if (!hasExactFields(report.finiteMetricCounts, AA_PUBLIC_METRICS, `${path}.finiteMetricCounts`, reasons)) return;
  for (const metric of AA_PUBLIC_METRICS) {
    const value = report.finiteMetricCounts[metric];
    if (!Number.isSafeInteger(value) || value < 0) {
      addReason(reasons, `${path}.finiteMetricCounts.${metric} must be a non-negative safe integer`);
    } else if (value !== snapshotSummary.finiteMetricCounts[metric]) {
      addReason(reasons, `${path}.finiteMetricCounts.${metric} is inconsistent with the public AA snapshot`);
    }
  }

  if (!hasExactFields(report.missingIdentity, AA_PUBLIC_IDENTITY_FIELDS, `${path}.missingIdentity`, reasons)) return;
  for (const field of AA_PUBLIC_IDENTITY_FIELDS) {
    const entryPath = `${path}.missingIdentity.${field}`;
    const entry = report.missingIdentity[field];
    if (!hasExactFields(entry, AA_PUBLIC_MISSING_IDENTITY_ENTRY_FIELDS, entryPath, reasons)) continue;
    if (!Number.isSafeInteger(entry.count) || entry.count < 0) {
      addReason(reasons, `${entryPath}.count must be a non-negative safe integer`);
    }
    const sourceIds = readStringSet(entry.sourceIds, `${entryPath}.sourceIds`, reasons);
    if (sourceIds && canonicalJson([...sourceIds]) !== canonicalJson([...sourceIds].sort())) {
      addReason(reasons, `${entryPath}.sourceIds must be ordered by sourceId`);
    }
    const expectedIds = snapshotSummary.missingIdentity[field];
    if (entry.count !== expectedIds.length || !sourceIds || !sameSet(sourceIds, new Set(expectedIds))) {
      addReason(reasons, `${entryPath} is inconsistent with the public AA snapshot`);
    }
  }
}

function compareAaPublicMetadata(baseSummary, headSummary, reasons) {
  for (const [sourceId, baseMetadata] of baseSummary.metadataBySourceId) {
    const headMetadata = headSummary.metadataBySourceId.get(sourceId);
    if (headMetadata !== undefined && headMetadata !== baseMetadata) {
      addReason(reasons, `public AA identity metadata changed: ${sourceId}`);
    }
  }
}

function checkAaPublicArtifacts(base, head, reasons) {
  const baseArtifactsExist = isObject(base.aaPublicSnapshot)
    && isObject(base.aaPublicJson)
    && isObject(base.aaPublicReport);
  if (!baseArtifactsExist) {
    addReason(reasons, "public AA baseline is missing from base; first full snapshot requires human review");
  }
  const headArtifactsExist = isObject(head.aaPublicSnapshot)
    && isObject(head.aaPublicJson)
    && isObject(head.aaPublicReport);
  if (!headArtifactsExist) {
    addReason(reasons, "public AA snapshot, backend JSON, and sync report must exist in head");
  }

  const baseTsSummary = isObject(base.aaPublicSnapshot)
    ? validateAaPublicSnapshot(base.aaPublicSnapshot, "base.aaPublicSnapshot", reasons)
    : null;
  const baseJsonSummary = isObject(base.aaPublicJson)
    ? validateAaPublicSnapshot(base.aaPublicJson, "base.aaPublicJson", reasons)
    : null;
  const headTsSummary = isObject(head.aaPublicSnapshot)
    ? validateAaPublicSnapshot(head.aaPublicSnapshot, "head.aaPublicSnapshot", reasons)
    : null;
  const headJsonSummary = isObject(head.aaPublicJson)
    ? validateAaPublicSnapshot(head.aaPublicJson, "head.aaPublicJson", reasons)
    : null;

  if (
    isObject(base.aaPublicSnapshot)
    && isObject(base.aaPublicJson)
    && canonicalJson(base.aaPublicSnapshot) !== canonicalJson(base.aaPublicJson)
  ) {
    addReason(reasons, "base public AA TypeScript snapshot and backend JSON are not semantically equal");
  }
  if (
    isObject(head.aaPublicSnapshot)
    && isObject(head.aaPublicJson)
    && canonicalJson(head.aaPublicSnapshot) !== canonicalJson(head.aaPublicJson)
  ) {
    addReason(reasons, "head public AA TypeScript snapshot and backend JSON are not semantically equal");
  }

  if (isObject(base.aaPublicReport)) {
    validateAaPublicReport(base.aaPublicReport, baseJsonSummary ?? baseTsSummary, "base.aaPublicReport", reasons);
  }
  if (isObject(head.aaPublicReport)) {
    validateAaPublicReport(head.aaPublicReport, headJsonSummary ?? headTsSummary, "head.aaPublicReport", reasons);
  }

  const baseSummary = baseJsonSummary ?? baseTsSummary;
  const headSummary = headJsonSummary ?? headTsSummary;
  if (!baseSummary || !headSummary) return;

  if (baseSummary.snapshot.schemaVersion !== headSummary.snapshot.schemaVersion) {
    addReason(reasons, "public AA schema version changed; human review required");
    return;
  }
  if (baseSummary.snapshot.source.url !== headSummary.snapshot.source.url) {
    addReason(reasons, "public AA source URL changed; human review required");
  }
  if (baseSummary.snapshot.source.schemaFingerprint !== headSummary.snapshot.source.schemaFingerprint) {
    addReason(reasons, "public AA schema fingerprint changed; human review required");
  }
  if (
    baseSummary.snapshot.source.intelligenceIndexVersion
    !== headSummary.snapshot.source.intelligenceIndexVersion
  ) {
    addReason(reasons, "public AA Intelligence Index version changed; human review required");
  }
  if (baseSummary.pagination.pageSize !== headSummary.pagination.pageSize) {
    addReason(reasons, "public AA pagination pageSize changed; human review required");
  }

  compareAaPublicMetadata(baseSummary, headSummary, reasons);
  const countPairs = [
    ["fetchedRowCount", baseSummary.pagination?.fetchedRowCount, headSummary.pagination?.fetchedRowCount],
    ...AA_PUBLIC_METRICS.map((metric) => [
      `finiteMetricCounts.${metric}`,
      baseSummary.finiteMetricCounts[metric],
      headSummary.finiteMetricCounts[metric],
    ]),
  ];
  for (const [label, baseCount, headCount] of countPairs) {
    if (
      Number.isSafeInteger(baseCount)
      && baseCount > 0
      && Number.isSafeInteger(headCount)
      && headCount < baseCount * 0.8
    ) {
      addReason(reasons, `public AA ${label} dropped by more than 20%`);
    }
  }
}

function checkReportSource(baseReport, headReport, field, reasons) {
  const label = field === "artificialAnalysis" ? "artificialAnalysis" : "arena";
  const base = isObject(baseReport?.[field]) ? baseReport[field] : null;
  const head = isObject(headReport?.[field]) ? headReport[field] : null;
  if (!base || !head) {
    addReason(reasons, `${label} report must exist in base and head`);
    return;
  }

  if (base.status !== "updated" || head.status !== "updated") {
    addReason(reasons, `${label} status must be updated in base and head`);
  }

  const baseAmbiguous = base.ambiguous;
  const headAmbiguous = head.ambiguous;
  if (!Array.isArray(baseAmbiguous) || !Array.isArray(headAmbiguous)) {
    addReason(reasons, `${label}.ambiguous must be an array in base and head`);
  } else if (baseAmbiguous.length > 0 || headAmbiguous.length > 0) {
    addReason(reasons, `${label}.ambiguous must be empty in base and head`);
  }

  const baseMatched = readStringSet(base.matched, `base.syncReport.${label}.matched`, reasons);
  const headMatched = readStringSet(head.matched, `head.syncReport.${label}.matched`, reasons);
  const baseUnmatched = readStringSet(base.unmatched, `base.syncReport.${label}.unmatched`, reasons);
  const headUnmatched = readStringSet(head.unmatched, `head.syncReport.${label}.unmatched`, reasons);

  if (baseMatched && headMatched && !sameSet(baseMatched, headMatched)) {
    addReason(reasons, `${label}.matched set changed`);
  }
  if (baseUnmatched && headUnmatched && !sameSet(baseUnmatched, headUnmatched)) {
    addReason(reasons, `${label}.unmatched set changed`);
  }

  if (baseMatched && baseUnmatched && [...baseMatched].some((item) => baseUnmatched.has(item))) {
    addReason(reasons, `base ${label} matched and unmatched sets overlap`);
  }
  if (headMatched && headUnmatched && [...headMatched].some((item) => headUnmatched.has(item))) {
    addReason(reasons, `head ${label} matched and unmatched sets overlap`);
  }
}

function normalizeSyncReport(report, path, reasons) {
  if (!isObject(report)) return null;
  const normalized = cloneJson(report);
  if (typeof normalized.generatedAt !== "string" || normalized.generatedAt.trim() === "") {
    addReason(reasons, `${path}.generatedAt must be a non-empty string`);
  }
  normalized.generatedAt = "<generated-at>";

  for (const field of ["artificialAnalysis", "arena"]) {
    const source = normalized[field];
    if (!isObject(source)) continue;
    if (Array.isArray(source.matched)) source.matched.sort();
    if (Array.isArray(source.unmatched)) source.unmatched.sort();
    if (field === "artificialAnalysis") {
      if (!Number.isInteger(source.rows) || source.rows < 0) {
        addReason(reasons, `${path}.${field}.rows must be a non-negative integer`);
      }
      source.rows = "<source-row-count>";
    } else if (!isObject(source.rows)) {
      addReason(reasons, `${path}.${field}.rows must contain non-negative integer counts`);
      source.rows = {};
    } else {
      for (const [rowKind, value] of Object.entries(source.rows)) {
        if (!Number.isInteger(value) || value < 0) {
          addReason(reasons, `${path}.${field}.rows must contain non-negative integer counts`);
        }
        source.rows[rowKind] = "<source-row-count>";
      }
    }
  }
  return normalized;
}

function observationIdentityMap(observations, kind, path, reasons) {
  if (!Array.isArray(observations)) {
    addReason(reasons, `${path} must be an array`);
    return null;
  }

  const identities = new Map();
  for (const [index, observation] of observations.entries()) {
    if (!isObject(observation)) {
      addReason(reasons, `${path}[${index}] must be an object`);
      continue;
    }

    let key;
    let identity;
    if (kind === "aa") {
      if (!AA_BENCHMARK_IDS.has(observation.benchmarkId)) continue;
      if (typeof observation.modelId !== "string" || typeof observation.benchmarkId !== "string") {
        addReason(reasons, `${path}[${index}] has an invalid AA identity`);
        continue;
      }
      key = `${observation.modelId}\u0000${observation.benchmarkId}`;
      const { value: _value, observedAt: _observedAt, ...stableFields } = observation;
      identity = stableFields;
    } else {
      if (typeof observation.modelId !== "string" || typeof observation.dimension !== "string") {
        addReason(reasons, `${path}[${index}] has an invalid Arena identity`);
        continue;
      }
      key = `${observation.modelId}\u0000${observation.dimension}`;
      const {
        value: _value,
        rank: _rank,
        lower: _lower,
        upper: _upper,
        observations: _observations,
        observedAt: _observedAt,
        ...stableFields
      } = observation;
      identity = stableFields;
    }

    if (identities.has(key)) {
      addReason(reasons, `${path} contains duplicate identity ${JSON.stringify(key.replace("\u0000", "/"))}`);
      continue;
    }
    identities.set(key, canonicalJson(identity));
  }
  return identities;
}

function compareIdentityMaps(base, head, label, reasons) {
  if (!base || !head) return;
  if (!sameSet(new Set(base.keys()), new Set(head.keys()))) {
    addReason(reasons, `${label} observation identity set changed`);
    return;
  }
  for (const [key, identity] of base) {
    if (head.get(key) !== identity) {
      addReason(reasons, `${label} observation identity changed: ${key.replace("\u0000", "/")}`);
    }
  }
}

function aaSnapshotIdentityMap(snapshot, path, reasons) {
  if (!isObject(snapshot)) {
    addReason(reasons, `${path} must be an object`);
    return null;
  }
  if (typeof snapshot.source !== "string" || snapshot.source === "") {
    addReason(reasons, `${path}.source must be a non-empty string`);
  }
  if (typeof snapshot.sourceUrl !== "string" || snapshot.sourceUrl === "") {
    addReason(reasons, `${path}.sourceUrl must be a non-empty string`);
  }
  if (!isObject(snapshot.models)) {
    addReason(reasons, `${path}.models must be an object`);
    return null;
  }

  const identities = new Map();
  for (const [modelId, profile] of Object.entries(snapshot.models)) {
    if (modelId.trim() === "" || !isObject(profile)) {
      addReason(reasons, `${path}.models contains an invalid model profile`);
      continue;
    }
    for (const [metric, observation] of Object.entries(profile)) {
      const observationPath = `${path}.models.${modelId}.${metric}`;
      if (!AA_METRICS.has(metric)) {
        addReason(reasons, `${observationPath} uses an unsupported AA metric`);
        continue;
      }
      if (!isObject(observation)) {
        addReason(reasons, `${observationPath} must be an object`);
        continue;
      }
      const identity = {};
      for (const field of ["modelVersion", "sourceId", "sourceSlug"]) {
        if (typeof observation[field] !== "string" || observation[field].trim() === "") {
          addReason(reasons, `${observationPath}.${field} must be a non-empty string`);
        } else {
          identity[field] = observation[field];
        }
      }
      identities.set(`${modelId}\u0000${metric}`, canonicalJson(identity));
    }
  }
  return identities;
}

function aaLeaderboardIdentityMap(snapshot, path, reasons) {
  if (!isObject(snapshot)) return null;
  if (snapshot.intelligenceLeaderboard === undefined) {
    if (snapshot.intelligenceIndexVersion !== undefined) {
      addReason(reasons, `${path}.intelligenceIndexVersion requires intelligenceLeaderboard`);
    }
    return new Map();
  }
  if (!Array.isArray(snapshot.intelligenceLeaderboard)) {
    addReason(reasons, `${path}.intelligenceLeaderboard must be an array`);
    return null;
  }
  if (snapshot.intelligenceLeaderboard.length !== AA_LEADERBOARD_LIMIT) {
    addReason(reasons, `${path}.intelligenceLeaderboard must contain exactly ${AA_LEADERBOARD_LIMIT} entries`);
  }
  if (
    !isFiniteNumber(snapshot.intelligenceIndexVersion)
    || snapshot.intelligenceIndexVersion <= 0
  ) {
    addReason(reasons, `${path}.intelligenceIndexVersion must be a positive finite number`);
  }

  const identities = new Map();
  const observedDates = new Set();
  let previous = null;
  for (const [index, entry] of snapshot.intelligenceLeaderboard.entries()) {
    const entryPath = `${path}.intelligenceLeaderboard[${index}]`;
    if (!isObject(entry)) {
      addReason(reasons, `${entryPath} must be an object`);
      continue;
    }
    if (canonicalJson(Object.keys(entry).sort()) !== canonicalJson(AA_LEADERBOARD_FIELDS)) {
      addReason(reasons, `${entryPath} has missing or unexpected fields`);
    }

    const identity = {};
    for (const field of ["sourceId", "sourceSlug", "modelVersion"]) {
      if (typeof entry[field] !== "string" || entry[field].trim() === "" || entry[field].trim() !== entry[field]) {
        addReason(reasons, `${entryPath}.${field} must be a non-empty string`);
      } else {
        identity[field] = entry[field];
      }
    }
    for (const field of ["creatorId", "creatorName"]) {
      if (entry[field] !== null && (
        typeof entry[field] !== "string"
        || entry[field].trim() === ""
        || entry[field].trim() !== entry[field]
      )) {
        addReason(reasons, `${entryPath}.${field} must be a non-empty string or null`);
      }
      identity[field] = entry[field];
    }
    if (
      entry.releaseDate !== null
      && (
        typeof entry.releaseDate !== "string"
        || !isIsoDate(entry.releaseDate)
      )
    ) {
      addReason(reasons, `${entryPath}.releaseDate must be an ISO date or null`);
    }
    identity.releaseDate = entry.releaseDate;
    if (!isFiniteNumber(entry.value)) {
      addReason(reasons, `${entryPath}.value must be a finite number`);
    }
    if (!isIsoDate(entry.observedAt)) {
      addReason(reasons, `${entryPath}.observedAt must be an ISO date`);
    } else {
      observedDates.add(entry.observedAt);
    }
    if (typeof entry.sourceId === "string") {
      if (identities.has(entry.sourceId)) {
        addReason(reasons, `${path}.intelligenceLeaderboard contains duplicate sourceId ${JSON.stringify(entry.sourceId)}`);
      }
      identities.set(entry.sourceId, canonicalJson(identity));
    }

    if (previous && isFiniteNumber(previous.value) && isFiniteNumber(entry.value)) {
      const tieOrder = previous.value === entry.value
        ? (String(previous.modelVersion) < String(entry.modelVersion) ? -1 : String(previous.modelVersion) > String(entry.modelVersion) ? 1 : 0)
          || (String(previous.sourceId) < String(entry.sourceId) ? -1 : String(previous.sourceId) > String(entry.sourceId) ? 1 : 0)
        : 0;
      if (previous.value < entry.value || (previous.value === entry.value && tieOrder > 0)) {
        addReason(reasons, `${path}.intelligenceLeaderboard is not in deterministic Intelligence order`);
      }
    }
    previous = entry;
  }
  if (observedDates.size > 1) {
    addReason(reasons, `${path}.intelligenceLeaderboard entries must share one observedAt date`);
  }
  return identities;
}

function checkAaSnapshot(baseSnapshot, headSnapshot, reasons) {
  const baseIdentities = aaSnapshotIdentityMap(baseSnapshot, "base.aaSnapshot", reasons);
  const headIdentities = aaSnapshotIdentityMap(headSnapshot, "head.aaSnapshot", reasons);
  const baseLeaderboardIdentities = aaLeaderboardIdentityMap(baseSnapshot, "base.aaSnapshot", reasons);
  const headLeaderboardIdentities = aaLeaderboardIdentityMap(headSnapshot, "head.aaSnapshot", reasons);
  if (!isObject(baseSnapshot) || !isObject(headSnapshot)) return;

  if (baseSnapshot.source !== headSnapshot.source) addReason(reasons, "AA snapshot source changed");
  if (baseSnapshot.sourceUrl !== headSnapshot.sourceUrl) addReason(reasons, "AA snapshot sourceUrl changed");
  if (baseSnapshot.intelligenceIndexVersion !== headSnapshot.intelligenceIndexVersion) {
    addReason(reasons, "AA Intelligence Index version changed");
  }
  compareIdentityMaps(baseIdentities, headIdentities, "AA snapshot", reasons);
  compareIdentityMaps(baseLeaderboardIdentities, headLeaderboardIdentities, "AA leaderboard", reasons);

  const normalized = [baseSnapshot, headSnapshot].map((snapshot, snapshotIndex) => {
    const path = snapshotIndex === 0 ? "base.aaSnapshot" : "head.aaSnapshot";
    const result = cloneJson(snapshot);
    if (typeof result.generatedAt !== "string" || result.generatedAt.trim() === "") {
      addReason(reasons, `${path}.generatedAt must be a non-empty string`);
    }
    result.generatedAt = "<generated-at>";
    if (isObject(result.models)) {
      for (const [modelId, profile] of Object.entries(result.models)) {
        if (!isObject(profile)) continue;
        for (const [metric, observation] of Object.entries(profile)) {
          if (!isObject(observation)) continue;
          const observationPath = `${path}.models.${modelId}.${metric}`;
          if (!isFiniteNumber(observation.value)) {
            addReason(reasons, `${observationPath}.value must be a finite number`);
          }
          if (typeof observation.observedAt !== "string" || observation.observedAt.trim() === "") {
            addReason(reasons, `${observationPath}.observedAt must be a non-empty string`);
          }
          observation.value = "<value>";
          observation.observedAt = "<observed-at>";
        }
      }
    }
    if (Array.isArray(result.intelligenceLeaderboard)) {
      for (const entry of result.intelligenceLeaderboard) {
        if (!isObject(entry)) continue;
        entry.value = "<value>";
        entry.observedAt = "<observed-at>";
      }
      result.intelligenceLeaderboard.sort((left, right) => (
        String(left.sourceId) < String(right.sourceId) ? -1 : String(left.sourceId) > String(right.sourceId) ? 1 : 0
      ));
    }
    return result;
  });
  if (canonicalJson(normalized[0]) !== canonicalJson(normalized[1])) {
    addReason(reasons, "AA snapshot changed outside routine value fields");
  }
}

function normalizeArenaSnapshot(snapshot, path, reasons) {
  if (!isObject(snapshot)) {
    addReason(reasons, `${path} must be an object`);
    return null;
  }
  const normalized = cloneJson(snapshot);
  if (typeof normalized.generatedAt !== "string" || normalized.generatedAt.trim() === "") {
    addReason(reasons, `${path}.generatedAt must be a non-empty string`);
  }
  normalized.generatedAt = "<generated-at>";
  if (typeof normalized.sourceUrl !== "string" || normalized.sourceUrl.trim() === "") {
    addReason(reasons, `${path}.sourceUrl must be a non-empty string`);
  }
  if (!isObject(normalized.models)) {
    addReason(reasons, `${path}.models must be an object`);
    return normalized;
  }

  for (const [modelId, profile] of Object.entries(normalized.models)) {
    if (modelId.trim() === "" || !isObject(profile)) {
      addReason(reasons, `${path}.models contains an invalid model profile`);
      continue;
    }
    for (const [dimension, metric] of Object.entries(profile)) {
      const metricPath = `${path}.models.${modelId}.${dimension}`;
      if (!new Set(["text", "webdev", "agent"]).has(dimension)) {
        addReason(reasons, `${metricPath} uses an unsupported Arena dimension`);
      }
      if (!isObject(metric)) {
        addReason(reasons, `${metricPath} must be an object`);
        continue;
      }
      if (!isFiniteNumber(metric.value)) addReason(reasons, `${metricPath}.value must be a finite number`);
      if (!isNullableFiniteNumber(metric.rank)) addReason(reasons, `${metricPath}.rank must be null or finite`);
      if (!isNullableFiniteNumber(metric.lower)) addReason(reasons, `${metricPath}.lower must be null or finite`);
      if (!isNullableFiniteNumber(metric.upper)) addReason(reasons, `${metricPath}.upper must be null or finite`);
      if (!isNullableFiniteNumber(metric.observations)) {
        addReason(reasons, `${metricPath}.observations must be null or finite`);
      }
      if (typeof metric.observedAt !== "string" || metric.observedAt.trim() === "") {
        addReason(reasons, `${metricPath}.observedAt must be a non-empty string`);
      }
      for (const field of ["value", "rank", "lower", "upper", "observations", "observedAt"]) {
        metric[field] = `<${field}>`;
      }
    }
  }
  return normalized;
}

function checkArenaSnapshot(baseSnapshot, headSnapshot, reasons) {
  const base = normalizeArenaSnapshot(baseSnapshot, "base.arenaSnapshot", reasons);
  const head = normalizeArenaSnapshot(headSnapshot, "head.arenaSnapshot", reasons);
  if (!base || !head) return;
  if (base.sourceUrl !== head.sourceUrl) addReason(reasons, "Arena snapshot sourceUrl changed");
  if (canonicalJson(base) !== canonicalJson(head)) {
    addReason(reasons, "Arena snapshot changed outside routine value fields");
  }
}

function normalizeEvidence(evidence, path, reasons) {
  if (!isObject(evidence)) return null;
  const normalized = cloneJson(evidence);
  if (typeof normalized.benchmarkDate !== "string" || normalized.benchmarkDate.trim() === "") {
    addReason(reasons, `${path}.benchmarkDate must be a non-empty string`);
  }
  normalized.benchmarkDate = "<benchmark-date>";

  if (Array.isArray(normalized.benchmarkObservations)) {
    for (const [index, observation] of normalized.benchmarkObservations.entries()) {
      if (!isObject(observation) || !AA_BENCHMARK_IDS.has(observation.benchmarkId)) continue;
      const observationPath = `${path}.benchmarkObservations[${index}]`;
      if (!isFiniteNumber(observation.value)) {
        addReason(reasons, `${observationPath}.value must be a finite number`);
      }
      if (typeof observation.observedAt !== "string" || observation.observedAt.trim() === "") {
        addReason(reasons, `${observationPath}.observedAt must be a non-empty string`);
      }
      observation.value = "<value>";
      observation.observedAt = "<observed-at>";
    }
  }

  if (isObject(normalized.arena)) {
    if (typeof normalized.arena.generatedAt !== "string" || normalized.arena.generatedAt.trim() === "") {
      addReason(reasons, `${path}.arena.generatedAt must be a non-empty string`);
    }
    normalized.arena.generatedAt = "<generated-at>";
    if (Array.isArray(normalized.arena.observations)) {
      for (const [index, observation] of normalized.arena.observations.entries()) {
        if (!isObject(observation)) continue;
        const observationPath = `${path}.arena.observations[${index}]`;
        if (!isFiniteNumber(observation.value)) {
          addReason(reasons, `${observationPath}.value must be a finite number`);
        }
        for (const field of ["rank", "lower", "upper", "observations"]) {
          if (!isNullableFiniteNumber(observation[field])) {
            addReason(reasons, `${observationPath}.${field} must be null or finite`);
          }
        }
        if (typeof observation.observedAt !== "string" || observation.observedAt.trim() === "") {
          addReason(reasons, `${observationPath}.observedAt must be a non-empty string`);
        }
        for (const field of ["value", "rank", "lower", "upper", "observations", "observedAt"]) {
          observation[field] = `<${field}>`;
        }
      }
    }
  }
  return normalized;
}

function checkEvidence(baseEvidence, headEvidence, reasons) {
  if (!isObject(baseEvidence) || !isObject(headEvidence)) {
    addReason(reasons, "evidence must exist in base and head");
    return;
  }
  if (
    !Number.isInteger(baseEvidence.schemaVersion)
    || baseEvidence.schemaVersion < 1
    || !Number.isInteger(headEvidence.schemaVersion)
    || headEvidence.schemaVersion < 1
  ) {
    addReason(reasons, "evidence schemaVersion must be a positive integer in base and head");
  } else if (baseEvidence.schemaVersion !== headEvidence.schemaVersion) {
    addReason(reasons, "evidence schemaVersion changed");
  }

  const baseAa = observationIdentityMap(
    baseEvidence.benchmarkObservations,
    "aa",
    "base.evidence.benchmarkObservations",
    reasons,
  );
  const headAa = observationIdentityMap(
    headEvidence.benchmarkObservations,
    "aa",
    "head.evidence.benchmarkObservations",
    reasons,
  );
  compareIdentityMaps(baseAa, headAa, "AA", reasons);

  const baseArena = isObject(baseEvidence.arena) ? baseEvidence.arena : null;
  const headArena = isObject(headEvidence.arena) ? headEvidence.arena : null;
  if (!baseArena || !headArena) {
    addReason(reasons, "Arena evidence must exist in base and head");
    return;
  }
  if (
    typeof baseArena.sourceUrl !== "string"
    || baseArena.sourceUrl === ""
    || typeof headArena.sourceUrl !== "string"
    || headArena.sourceUrl === ""
  ) {
    addReason(reasons, "Arena sourceUrl must be a non-empty string in base and head");
  } else if (baseArena.sourceUrl !== headArena.sourceUrl) {
    addReason(reasons, "Arena sourceUrl changed");
  }

  const baseArenaIdentities = observationIdentityMap(
    baseArena.observations,
    "arena",
    "base.evidence.arena.observations",
    reasons,
  );
  const headArenaIdentities = observationIdentityMap(
    headArena.observations,
    "arena",
    "head.evidence.arena.observations",
    reasons,
  );
  compareIdentityMaps(baseArenaIdentities, headArenaIdentities, "Arena", reasons);

  const normalizedBase = normalizeEvidence(baseEvidence, "base.evidence", reasons);
  const normalizedHead = normalizeEvidence(headEvidence, "head.evidence", reasons);
  if (normalizedBase && normalizedHead && canonicalJson(normalizedBase) !== canonicalJson(normalizedHead)) {
    addReason(reasons, "evidence changed outside routine refresh fields");
  }
}

export function evaluateDataUpdatePolicy(input) {
  const reasons = [];
  if (!isObject(input)) return { eligible: false, reasons: ["input must be an object"] };

  checkChanges(input.changes, reasons);

  const base = isObject(input.base) ? input.base : null;
  const head = isObject(input.head) ? input.head : null;
  if (!base || !head) {
    addReason(reasons, "base and head must be objects");
    return { eligible: false, reasons };
  }

  const publicAaTouched = Array.isArray(input.changes)
    && input.changes.some((change) => AA_PUBLIC_PATHS.has(getChangePath(change)));
  if (publicAaTouched) checkAaPublicArtifacts(base, head, reasons);

  if (!isObject(base.catalog) || !isObject(head.catalog)) {
    addReason(reasons, "catalog must exist in base and head");
  } else if (canonicalJson(base.catalog) !== canonicalJson(head.catalog)) {
    addReason(reasons, "catalog changed");
  }

  checkAaSnapshot(base.aaSnapshot, head.aaSnapshot, reasons);
  checkArenaSnapshot(base.arenaSnapshot, head.arenaSnapshot, reasons);

  const baseReport = isObject(base.syncReport) ? base.syncReport : null;
  const headReport = isObject(head.syncReport) ? head.syncReport : null;
  if (!baseReport || !headReport) {
    addReason(reasons, "syncReport must exist in base and head");
  } else {
    if (
      typeof baseReport.policy !== "string"
      || baseReport.policy === ""
      || typeof headReport.policy !== "string"
      || headReport.policy === ""
    ) {
      addReason(reasons, "sync report policy must be a non-empty string in base and head");
    } else if (baseReport.policy !== headReport.policy) {
      addReason(reasons, "sync report policy changed");
    }
    checkReportSource(baseReport, headReport, "artificialAnalysis", reasons);
    checkReportSource(baseReport, headReport, "arena", reasons);
    const normalizedBaseReport = normalizeSyncReport(baseReport, "base.syncReport", reasons);
    const normalizedHeadReport = normalizeSyncReport(headReport, "head.syncReport", reasons);
    if (
      normalizedBaseReport
      && normalizedHeadReport
      && canonicalJson(normalizedBaseReport) !== canonicalJson(normalizedHeadReport)
    ) {
      addReason(reasons, "sync report changed outside routine refresh fields");
    }
  }

  checkEvidence(base.evidence, head.evidence, reasons);
  return { eligible: reasons.length === 0, reasons };
}

async function runCli() {
  try {
    if (process.argv.length > 3) throw new Error("usage: node scripts/data-update-policy.mjs [input.json|-]");
    const inputPath = process.argv[2];
    const raw = inputPath && inputPath !== "-"
      ? await readFile(resolve(inputPath), "utf8")
      : await readStdin();
    const result = evaluateDataUpdatePolicy(JSON.parse(raw));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.eligible ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ eligible: false, reasons: [`invalid input: ${message}`] })}\n`);
    process.exitCode = 1;
  }
}

async function readStdin() {
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runCli();
}
