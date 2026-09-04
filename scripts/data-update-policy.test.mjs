import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateDataUpdatePolicy, parseGeneratedSnapshotModule } from "./data-update-policy.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const policyScript = resolve(scriptDirectory, "data-update-policy.mjs");

function report() {
  return {
    generatedAt: "2026-09-03T00:00:00.000Z",
    policy: "exact versions only",
    artificialAnalysis: {
      status: "updated",
      matched: ["model-a", "model-b"],
      unmatched: ["model-c"],
      ambiguous: [],
      rows: 600,
    },
    arena: {
      status: "updated",
      matched: ["model-a"],
      unmatched: ["model-b", "model-c"],
      ambiguous: [],
      rows: { text: 10, webdev: 8, agent: 4 },
    },
  };
}

function evidence() {
  return {
    schemaVersion: 1,
    benchmarkDate: "2026-09-03",
    benchmarkObservations: [
      {
        modelId: "model-a",
        benchmarkId: "aa-intelligence",
        value: 70,
        modelVersion: "Model A 1.0",
        observedAt: "2026-09-03",
        definition: {
          id: "aa-intelligence",
          sourceUrl: "https://artificialanalysis.ai/data-api/docs",
          unit: "index",
        },
      },
      {
        modelId: "model-b",
        benchmarkId: "static-benchmark",
        value: 55,
        modelVersion: "Model B 1.0",
        observedAt: "2026-08-01",
      },
    ],
    arena: {
      generatedAt: "2026-09-03T00:00:00.000Z",
      sourceUrl: "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
      observations: [
        {
          modelId: "model-a",
          dimension: "text",
          value: 1400,
          rank: 2,
          lower: 1390,
          upper: 1410,
          observations: 1000,
          category: "overall",
          observedAt: "2026-09-03",
          modelVersion: "model-a-1.0",
        },
      ],
    },
  };
}

function catalog() {
  return {
    schemaVersion: 1,
    dataDate: "2026-09-01",
    models: [
      { id: "model-a", name: "Model A", aliases: { aaSlugs: ["model-a-1"] } },
      { id: "model-b", name: "Model B", aliases: { aaSlugs: ["model-b-1"] } },
    ],
  };
}

function aaSnapshot() {
  return {
    generatedAt: "2026-09-03T00:00:00.000Z",
    source: "Artificial Analysis Data API",
    sourceUrl: "https://artificialanalysis.ai/data-api/docs",
    intelligenceIndexVersion: 4.1,
    intelligenceLeaderboard: Array.from({ length: 20 }, (_, index) => ({
      sourceId: `leader-${String(index).padStart(2, "0")}`,
      sourceSlug: `leader-${index}`,
      modelVersion: `Leaderboard Model ${String(index).padStart(2, "0")}`,
      creatorId: `creator-${index}`,
      creatorName: `Creator ${index}`,
      releaseDate: "2026-09-01",
      value: 100 - index,
      observedAt: "2026-09-03",
    })),
    models: {
      "model-a": {
        intelligence: {
          value: 70,
          modelVersion: "Model A 1.0",
          observedAt: "2026-09-03",
          sourceId: "aa-model-a",
          sourceSlug: "model-a-1",
        },
      },
      "model-b": {
        coding: {
          value: 65,
          modelVersion: "Model B 1.0",
          observedAt: "2026-09-03",
          sourceId: "aa-model-b",
          sourceSlug: "model-b-1",
        },
      },
    },
  };
}

function arenaSnapshot() {
  return {
    generatedAt: "2026-09-03T00:00:00.000Z",
    sourceUrl: "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
    models: {
      "model-a": {
        text: {
          value: 1400,
          rank: 2,
          lower: 1390,
          upper: 1410,
          observations: 1000,
          category: "overall",
          observedAt: "2026-09-03",
          modelVersion: "model-a-1.0",
        },
      },
    },
  };
}

function eligibleInput() {
  const baseReport = report();
  const headReport = structuredClone(baseReport);
  headReport.generatedAt = "2026-09-04T00:00:00.000Z";
  headReport.artificialAnalysis.matched.reverse();
  headReport.arena.unmatched.reverse();
  headReport.artificialAnalysis.rows = 620;

  const baseEvidence = evidence();
  const headEvidence = structuredClone(baseEvidence);
  headEvidence.benchmarkDate = "2026-09-04";
  headEvidence.benchmarkObservations[0].value = 71.5;
  headEvidence.benchmarkObservations[0].observedAt = "2026-09-04";
  headEvidence.arena.generatedAt = "2026-09-04T00:00:00.000Z";
  headEvidence.arena.observations[0].value = 1412;
  headEvidence.arena.observations[0].rank = 1;
  headEvidence.arena.observations[0].lower = 1400;
  headEvidence.arena.observations[0].upper = 1424;
  headEvidence.arena.observations[0].observations = 1100;
  headEvidence.arena.observations[0].observedAt = "2026-09-04";

  const baseAaSnapshot = aaSnapshot();
  const headAaSnapshot = structuredClone(baseAaSnapshot);
  headAaSnapshot.generatedAt = "2026-09-04T00:00:00.000Z";
  headAaSnapshot.models["model-a"].intelligence.value = 71.5;
  headAaSnapshot.models["model-a"].intelligence.observedAt = "2026-09-04";
  headAaSnapshot.intelligenceLeaderboard[0].value = 100.5;
  for (const entry of headAaSnapshot.intelligenceLeaderboard) entry.observedAt = "2026-09-04";

  const baseArenaSnapshot = arenaSnapshot();
  const headArenaSnapshot = structuredClone(baseArenaSnapshot);
  headArenaSnapshot.generatedAt = "2026-09-04T00:00:00.000Z";
  headArenaSnapshot.models["model-a"].text.value = 1412;
  headArenaSnapshot.models["model-a"].text.rank = 1;
  headArenaSnapshot.models["model-a"].text.lower = 1400;
  headArenaSnapshot.models["model-a"].text.upper = 1424;
  headArenaSnapshot.models["model-a"].text.observations = 1100;
  headArenaSnapshot.models["model-a"].text.observedAt = "2026-09-04";

  return {
    changes: [
      { status: "M", path: "data/sync-report.json" },
      { status: "modified", filename: "data/modelops/generated/evidence.json" },
      { status: "M", path: "src/data/generated/aaSnapshot.ts" },
      { status: "modified", filename: "src/data/generated/arenaSnapshot.ts" },
    ],
    base: {
      catalog: catalog(),
      aaSnapshot: baseAaSnapshot,
      arenaSnapshot: baseArenaSnapshot,
      syncReport: baseReport,
      evidence: baseEvidence,
    },
    head: {
      catalog: catalog(),
      aaSnapshot: headAaSnapshot,
      arenaSnapshot: headArenaSnapshot,
      syncReport: headReport,
      evidence: headEvidence,
    },
  };
}

test("accepts routine value, rank, count, and observation-time refreshes", () => {
  assert.deepEqual(evaluateDataUpdatePolicy(eligibleInput()), { eligible: true, reasons: [] });
});

test("parses the generated TypeScript snapshot initializer without evaluating code", () => {
  const parsed = parseGeneratedSnapshotModule(
    'export interface Snapshot { models: object }\n\nexport const AA_SNAPSHOT: Snapshot = {"models":{}};\n',
    "AA_SNAPSHOT",
  );
  assert.deepEqual(parsed, { models: {} });
  assert.throws(
    () => parseGeneratedSnapshotModule("export const OTHER = {};", "AA_SNAPSHOT"),
    /missing export const AA_SNAPSHOT declaration/,
  );
});

test("rejects paths outside the exact allowlist and non-modification statuses", () => {
  const input = eligibleInput();
  input.changes.push({ status: "added", filename: "scripts/unsafe.mjs" });

  const result = evaluateDataUpdatePolicy(input);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.reasons, [
    "changed path is not allowed: scripts/unsafe.mjs",
    "changed path must be modified, not added: scripts/unsafe.mjs",
  ]);
});

test("rejects skipped sources and ambiguity", () => {
  const input = eligibleInput();
  input.head.syncReport.artificialAnalysis.status = "skipped_missing_AA_API_KEY";
  input.head.syncReport.arena.ambiguous.push({ modelId: "model-a", matches: 2 });

  const result = evaluateDataUpdatePolicy(input);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("artificialAnalysis status must be updated in base and head"));
  assert.ok(result.reasons.includes("arena.ambiguous must be empty in base and head"));
});

test("rejects changed matched and unmatched sets", () => {
  const input = eligibleInput();
  input.head.syncReport.artificialAnalysis.matched = ["model-a"];
  input.head.syncReport.artificialAnalysis.unmatched = ["model-b", "model-c"];

  const result = evaluateDataUpdatePolicy(input);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("artificialAnalysis.matched set changed"));
  assert.ok(result.reasons.includes("artificialAnalysis.unmatched set changed"));
});

test("rejects any catalog change", () => {
  const input = eligibleInput();
  input.head.catalog.models[0].name = "Renamed Model A";

  const result = evaluateDataUpdatePolicy(input);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("catalog changed"));
});

test("rejects AA snapshot key, source, and exact identity changes", () => {
  const changedIdentity = eligibleInput();
  changedIdentity.head.aaSnapshot.sourceUrl = "https://example.com/not-the-registered-source";
  changedIdentity.head.aaSnapshot.models["model-a"].intelligence.sourceSlug = "model-a-2";
  const changedResult = evaluateDataUpdatePolicy(changedIdentity);
  assert.equal(changedResult.eligible, false);
  assert.ok(changedResult.reasons.includes("AA snapshot sourceUrl changed"));
  assert.ok(changedResult.reasons.includes("AA snapshot observation identity changed: model-a/intelligence"));

  const changedKeys = eligibleInput();
  delete changedKeys.head.aaSnapshot.models["model-b"].coding;
  const changedKeysResult = evaluateDataUpdatePolicy(changedKeys);
  assert.equal(changedKeysResult.eligible, false);
  assert.ok(changedKeysResult.reasons.includes("AA snapshot observation identity set changed"));
});

test("accepts AA leaderboard score reordering when its source identities remain stable", () => {
  const input = eligibleInput();
  input.head.aaSnapshot.intelligenceLeaderboard[0].value = 98.5;
  input.head.aaSnapshot.intelligenceLeaderboard[1].value = 101;
  input.head.aaSnapshot.intelligenceLeaderboard[0].observedAt = "2026-09-04";
  input.head.aaSnapshot.intelligenceLeaderboard[1].observedAt = "2026-09-04";
  input.head.aaSnapshot.intelligenceLeaderboard.sort((left, right) => (
    right.value - left.value
    || (left.modelVersion < right.modelVersion ? -1 : left.modelVersion > right.modelVersion ? 1 : 0)
    || (left.sourceId < right.sourceId ? -1 : left.sourceId > right.sourceId ? 1 : 0)
  ));

  assert.deepEqual(evaluateDataUpdatePolicy(input), { eligible: true, reasons: [] });
});

test("rejects AA leaderboard membership, metadata, and index-version changes", () => {
  const membership = eligibleInput();
  membership.head.aaSnapshot.intelligenceLeaderboard[19].sourceId = "replacement-source";
  const membershipResult = evaluateDataUpdatePolicy(membership);
  assert.equal(membershipResult.eligible, false);
  assert.ok(membershipResult.reasons.includes("AA leaderboard observation identity set changed"));

  const metadata = eligibleInput();
  metadata.head.aaSnapshot.intelligenceLeaderboard[0].creatorName = "Renamed Creator";
  const metadataResult = evaluateDataUpdatePolicy(metadata);
  assert.equal(metadataResult.eligible, false);
  assert.ok(metadataResult.reasons.includes("AA leaderboard observation identity changed: leader-00"));

  const version = eligibleInput();
  version.head.aaSnapshot.intelligenceIndexVersion = 4.2;
  const versionResult = evaluateDataUpdatePolicy(version);
  assert.equal(versionResult.eligible, false);
  assert.ok(versionResult.reasons.includes("AA Intelligence Index version changed"));
});

test("rejects mixed AA leaderboard observation dates and invalid calendar dates", () => {
  const mixed = eligibleInput();
  mixed.head.aaSnapshot.intelligenceLeaderboard[0].observedAt = "2026-09-05";
  const mixedResult = evaluateDataUpdatePolicy(mixed);
  assert.equal(mixedResult.eligible, false);
  assert.ok(mixedResult.reasons.includes("head.aaSnapshot.intelligenceLeaderboard entries must share one observedAt date"));

  const invalid = eligibleInput();
  invalid.head.aaSnapshot.intelligenceLeaderboard[0].releaseDate = "2026-02-31";
  const invalidResult = evaluateDataUpdatePolicy(invalid);
  assert.equal(invalidResult.eligible, false);
  assert.ok(invalidResult.reasons.includes("head.aaSnapshot.intelligenceLeaderboard[0].releaseDate must be an ISO date or null"));
});

test("rejects missing AA identity fields", () => {
  const input = eligibleInput();
  delete input.head.aaSnapshot.models["model-a"].intelligence.sourceId;

  const result = evaluateDataUpdatePolicy(input);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes(
    "head.aaSnapshot.models.model-a.intelligence.sourceId must be a non-empty string",
  ));
});

test("rejects AA identity changes and observation additions", () => {
  const changedVersion = eligibleInput();
  changedVersion.head.evidence.benchmarkObservations[0].modelVersion = "Model A 2.0";
  const changedResult = evaluateDataUpdatePolicy(changedVersion);
  assert.equal(changedResult.eligible, false);
  assert.ok(changedResult.reasons.includes("AA observation identity changed: model-a/aa-intelligence"));

  const addedObservation = eligibleInput();
  addedObservation.head.evidence.benchmarkObservations.push({
    modelId: "model-b",
    benchmarkId: "aa-coding",
    value: 60,
    modelVersion: "Model B 1.0",
    observedAt: "2026-09-04",
    definition: { id: "aa-coding", sourceUrl: "https://artificialanalysis.ai/data-api/docs", unit: "index" },
  });
  const addedResult = evaluateDataUpdatePolicy(addedObservation);
  assert.equal(addedResult.eligible, false);
  assert.ok(addedResult.reasons.includes("AA observation identity set changed"));
});

test("rejects Arena identity and source changes", () => {
  const input = eligibleInput();
  input.head.evidence.arena.sourceUrl = "https://example.com/not-the-registered-source";
  input.head.evidence.arena.observations[0].category = "coding";

  const result = evaluateDataUpdatePolicy(input);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("Arena sourceUrl changed"));
  assert.ok(result.reasons.includes("Arena observation identity changed: model-a/text"));
});

test("rejects Arena snapshot source and stable identity changes", () => {
  const input = eligibleInput();
  input.head.arenaSnapshot.sourceUrl = "https://example.com/not-the-registered-source";
  input.head.arenaSnapshot.models["model-a"].text.modelVersion = "model-a-2.0";

  const result = evaluateDataUpdatePolicy(input);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("Arena snapshot sourceUrl changed"));
  assert.ok(result.reasons.includes("Arena snapshot changed outside routine value fields"));
});

test("rejects changes to static evidence and unexpected report fields", () => {
  const input = eligibleInput();
  input.head.evidence.benchmarkObservations[1].value = 99;
  input.head.syncReport.unexpected = "not generated by the approved synchronizer";
  input.head.syncReport.arena.rows.unexpected = 1;

  const result = evaluateDataUpdatePolicy(input);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("evidence changed outside routine refresh fields"));
  assert.ok(result.reasons.includes("sync report changed outside routine refresh fields"));
});

test("rejects malformed values in otherwise mutable refresh fields", () => {
  const input = eligibleInput();
  input.head.aaSnapshot.models["model-a"].intelligence.value = "71.5";
  input.head.aaSnapshot.intelligenceLeaderboard[0].value = "100.5";
  input.head.arenaSnapshot.models["model-a"].text.observations = "1100";

  const result = evaluateDataUpdatePolicy(input);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes(
    "head.aaSnapshot.models.model-a.intelligence.value must be a finite number",
  ));
  assert.ok(result.reasons.includes(
    "head.aaSnapshot.intelligenceLeaderboard[0].value must be a finite number",
  ));
  assert.ok(result.reasons.includes(
    "head.arenaSnapshot.models.model-a.text.observations must be null or finite",
  ));
});

test("fails closed for malformed input", () => {
  assert.deepEqual(evaluateDataUpdatePolicy(null), {
    eligible: false,
    reasons: ["input must be an object"],
  });

  const input = eligibleInput();
  input.head.syncReport.arena.matched = "model-a";
  delete input.head.evidence.schemaVersion;
  input.head.evidence.arena.sourceUrl = "";
  const result = evaluateDataUpdatePolicy(input);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("head.syncReport.arena.matched must be an array"));
  assert.ok(result.reasons.includes("evidence schemaVersion must be a positive integer in base and head"));
  assert.ok(result.reasons.includes("Arena sourceUrl must be a non-empty string in base and head"));
});

test("CLI reads a JSON file, emits JSON, and uses eligibility as its exit status", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "data-update-policy-"));
  try {
    const eligiblePath = join(temporaryDirectory, "eligible.json");
    await writeFile(eligiblePath, JSON.stringify(eligibleInput()), "utf8");
    const eligibleRun = spawnSync(process.execPath, [policyScript, eligiblePath], { encoding: "utf8" });
    assert.equal(eligibleRun.status, 0, eligibleRun.stderr);
    assert.deepEqual(JSON.parse(eligibleRun.stdout), { eligible: true, reasons: [] });

    const ineligible = eligibleInput();
    ineligible.head.syncReport.arena.ambiguous.push({ modelId: "model-a", matches: 2 });
    const ineligibleRun = spawnSync(process.execPath, [policyScript, "-"], {
      encoding: "utf8",
      input: JSON.stringify(ineligible),
    });
    assert.equal(ineligibleRun.status, 1, ineligibleRun.stderr);
    assert.ok(JSON.parse(ineligibleRun.stdout).reasons.includes("arena.ambiguous must be empty in base and head"));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
