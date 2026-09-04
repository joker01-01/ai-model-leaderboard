import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ALLOWED_DATA_UPDATE_PATHS = Object.freeze([
  "data/modelops/generated/catalog.json",
  "data/modelops/generated/evidence.json",
  "data/sync-report.json",
  "src/data/generated/aaSnapshot.ts",
  "src/data/generated/arenaSnapshot.ts",
]);

const ALLOWED_PATHS = new Set(ALLOWED_DATA_UPDATE_PATHS);
const AA_BENCHMARK_IDS = new Set(["aa-coding", "aa-intelligence"]);
const AA_METRICS = new Set(["coding", "intelligence"]);
const MODIFIED_STATUSES = new Set(["M", "modified"]);

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
  return JSON.parse(initializer.slice(0, -1));
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

function isNullableFiniteNumber(value) {
  return value === null || isFiniteNumber(value);
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
    const path = typeof change.path === "string" ? change.path : change.filename;
    if (typeof path !== "string" || path === "") {
      addReason(reasons, `changes[${index}] must include path or filename`);
      continue;
    }
    if (seen.has(path)) addReason(reasons, `duplicate changed path: ${path}`);
    seen.add(path);
    if (!ALLOWED_PATHS.has(path)) addReason(reasons, `changed path is not allowed: ${path}`);
    if (!MODIFIED_STATUSES.has(change.status)) {
      addReason(reasons, `changed path must be modified, not ${String(change.status)}: ${path}`);
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

function checkAaSnapshot(baseSnapshot, headSnapshot, reasons) {
  const baseIdentities = aaSnapshotIdentityMap(baseSnapshot, "base.aaSnapshot", reasons);
  const headIdentities = aaSnapshotIdentityMap(headSnapshot, "head.aaSnapshot", reasons);
  if (!isObject(baseSnapshot) || !isObject(headSnapshot)) return;

  if (baseSnapshot.source !== headSnapshot.source) addReason(reasons, "AA snapshot source changed");
  if (baseSnapshot.sourceUrl !== headSnapshot.sourceUrl) addReason(reasons, "AA snapshot sourceUrl changed");
  compareIdentityMaps(baseIdentities, headIdentities, "AA snapshot", reasons);

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
