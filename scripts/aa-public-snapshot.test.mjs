import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AA_FREE_V2_SCHEMA_FINGERPRINT,
  AA_PUBLIC_METRIC_FIELDS,
  AA_PUBLIC_SCHEMA_VERSION,
  AA_PUBLIC_SOURCE_URL,
  buildAaPublicReport,
  buildAaPublicSnapshot,
  renderAaPublicSnapshotModule,
  validateAaPublicSnapshot,
} from "./aa-public-snapshot.mjs";

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/aa-language-models-pages.json", import.meta.url), "utf8"),
);

function fixturePages() {
  return structuredClone(fixture.pages);
}

function buildFixture() {
  return buildAaPublicSnapshot(fixturePages(), { observedAt: "2026-09-04" });
}

test("normalizes every Free v2 page into one deterministic full snapshot", () => {
  const { snapshot, report } = buildFixture();

  assert.equal(snapshot.schemaVersion, AA_PUBLIC_SCHEMA_VERSION);
  assert.deepEqual(snapshot.source, {
    url: AA_PUBLIC_SOURCE_URL,
    observedAt: "2026-09-04",
    schemaFingerprint: AA_FREE_V2_SCHEMA_FINGERPRINT,
    intelligenceIndexVersion: 4.1,
    pagination: {
      pageSize: 3,
      totalPages: 2,
      declaredTotalRows: null,
      fetchedRowCount: 5,
    },
  });
  assert.match(snapshot.source.schemaFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(
    snapshot.models.map((model) => model.sourceId),
    ["model-alpha", "model-beta", "model-delta", "model-epsilon", "model-gamma"],
  );

  const beta = snapshot.models.find((model) => model.sourceId === "model-beta");
  assert.equal(beta.inputPricePerMillion, 0);
  assert.equal(beta.outputPricePerMillion, 0);
  assert.equal(beta.timeToFirstAnswerSeconds, 0);
  assert.equal(beta.outputTokensPerSecond, 0);
  assert.equal(beta.agentic, null);

  const epsilon = snapshot.models.find((model) => model.sourceId === "model-epsilon");
  assert.equal(epsilon.rawName, null);
  assert.equal(epsilon.sourceSlug, null);
  assert.equal(epsilon.intelligence, -2);
  assert.equal(epsilon.agentic, -5);
  assert.equal(epsilon.coding, null);

  assert.deepEqual(report.finiteMetricCounts, {
    intelligence: 4,
    coding: 3,
    agentic: 4,
    inputPricePerMillion: 4,
    outputPricePerMillion: 4,
    timeToFirstAnswerSeconds: 4,
    outputTokensPerSecond: 4,
  });
  assert.deepEqual(report.missingIdentity.rawName, {
    count: 2,
    sourceIds: ["model-epsilon", "model-gamma"],
  });
  assert.deepEqual(report.missingIdentity.sourceSlug, {
    count: 2,
    sourceIds: ["model-delta", "model-epsilon"],
  });
  assert.deepEqual(report.missingIdentity.creatorId, {
    count: 1,
    sourceIds: ["model-delta"],
  });
  assert.equal(report.rowCount, 5);
  assert.deepEqual(report.pagination, snapshot.source.pagination);
  assert.deepEqual(report, buildAaPublicReport(snapshot));
  assert.deepEqual(buildFixture(), { snapshot, report });
});

test("maps exactly the seven documented public metrics and keeps missing metrics null", () => {
  const { snapshot } = buildFixture();
  const alpha = snapshot.models.find((model) => model.sourceId === "model-alpha");
  assert.deepEqual(
    Object.fromEntries(AA_PUBLIC_METRIC_FIELDS.map((field) => [field, alpha[field]])),
    {
      intelligence: 80,
      coding: 70,
      agentic: 65,
      inputPricePerMillion: 3,
      outputPricePerMillion: 15,
      timeToFirstAnswerSeconds: 2.5,
      outputTokensPerSecond: 100,
    },
  );
  const gamma = snapshot.models.find((model) => model.sourceId === "model-gamma");
  assert.equal(gamma.rawName, null);
  assert.equal(gamma.inputPricePerMillion, null);
  assert.equal(gamma.timeToFirstAnswerSeconds, null);
});

test("canonicalizes optional identity whitespace without dropping rows", () => {
  const pages = fixturePages();
  pages[0].data[0].name = " Alpha Reasoning (Max) ";
  pages[0].data[1].name = " \t ";
  pages[0].data[1].slug = "";

  const { snapshot, report } = buildAaPublicSnapshot(pages, { observedAt: "2026-09-04" });
  const alpha = snapshot.models.find((model) => model.sourceId === "model-alpha");
  const beta = snapshot.models.find((model) => model.sourceId === "model-beta");

  assert.equal(snapshot.models.length, 5);
  assert.equal(alpha.rawName, "Alpha Reasoning (Max)");
  assert.equal(beta.rawName, null);
  assert.equal(beta.sourceSlug, null);
  assert.deepEqual(report.missingIdentity.rawName, {
    count: 3,
    sourceIds: ["model-beta", "model-epsilon", "model-gamma"],
  });
  assert.deepEqual(report.missingIdentity.sourceSlug, {
    count: 3,
    sourceIds: ["model-beta", "model-delta", "model-epsilon"],
  });
});

test("renders a deterministic TypeScript module semantically equal to the snapshot", () => {
  const { snapshot } = buildFixture();
  const rendered = renderAaPublicSnapshotModule(snapshot);
  const renderedAgain = renderAaPublicSnapshotModule(structuredClone(snapshot));

  assert.equal(rendered, renderedAgain);
  assert.match(rendered, /export const AA_PUBLIC_SNAPSHOT: AaPublicSnapshot = /);
  assert.match(rendered, /intelligenceIndexVersion: number;/);
  assert.doesNotMatch(rendered, /codingIndexVersion|agenticIndexVersion/);
  const match = rendered.match(/export const AA_PUBLIC_SNAPSHOT: AaPublicSnapshot = ([\s\S]+);\n$/);
  assert.ok(match);
  assert.deepEqual(JSON.parse(match[1]), snapshot);
});

test("fails closed on incomplete or inconsistent pagination", () => {
  assert.throws(
    () => buildAaPublicSnapshot(fixturePages().slice(0, 1), { observedAt: "2026-09-04" }),
    /stopped after 1 of 2 pages/,
  );

  const wrongPage = fixturePages();
  wrongPage[1].pagination.page = 3;
  assert.throws(
    () => buildAaPublicSnapshot(wrongPage, { observedAt: "2026-09-04" }),
    /pagination.page must equal 2/,
  );

  const wrongHasMore = fixturePages();
  wrongHasMore[0].pagination.has_more = false;
  assert.throws(
    () => buildAaPublicSnapshot(wrongHasMore, { observedAt: "2026-09-04" }),
    /has_more is inconsistent/,
  );

  const shortMiddlePage = fixturePages();
  shortMiddlePage[0].data.pop();
  assert.throws(
    () => buildAaPublicSnapshot(shortMiddlePage, { observedAt: "2026-09-04" }),
    /must fill page_size/,
  );

  const versionChanged = fixturePages();
  versionChanged[1].intelligence_index_version = 4.2;
  assert.throws(
    () => buildAaPublicSnapshot(versionChanged, { observedAt: "2026-09-04" }),
    /index version changed during pagination/,
  );

  const proTier = fixturePages();
  for (const page of proTier) page.tier = "pro";
  assert.deepEqual(
    buildAaPublicSnapshot(proTier, { observedAt: "2026-09-04" }).snapshot,
    buildFixture().snapshot,
  );

  const changedTier = fixturePages();
  changedTier[1].tier = "commercial";
  assert.throws(
    () => buildAaPublicSnapshot(changedTier, { observedAt: "2026-09-04" }),
    /tier changed during pagination/,
  );

  const invalidTier = fixturePages();
  invalidTier[0].tier = "enterprise";
  assert.throws(
    () => buildAaPublicSnapshot(invalidTier, { observedAt: "2026-09-04" }),
    /tier must be free, pro, or commercial/,
  );
});

test("rejects duplicate or malformed source identities without dropping missing display text", () => {
  const duplicate = fixturePages();
  duplicate[1].data[0].id = duplicate[0].data[0].id;
  assert.throws(
    () => buildAaPublicSnapshot(duplicate, { observedAt: "2026-09-04" }),
    /duplicate sourceId/,
  );

  const emptyId = fixturePages();
  emptyId[0].data[0].id = "";
  assert.throws(
    () => buildAaPublicSnapshot(emptyId, { observedAt: "2026-09-04" }),
    /AA row 0.id/,
  );

  const invalidNameType = fixturePages();
  invalidNameType[0].data[0].name = 42;
  assert.throws(
    () => buildAaPublicSnapshot(invalidNameType, { observedAt: "2026-09-04" }),
    /AA row 0.name/,
  );

  const invalidRelease = fixturePages();
  invalidRelease[0].data[0].release_date = "2026-02-30";
  assert.throws(
    () => buildAaPublicSnapshot(invalidRelease, { observedAt: "2026-09-04" }),
    /release_date/,
  );
});

test("rejects non-finite metrics and negative price or performance while accepting finite ability scores", () => {
  const nonFiniteAbility = fixturePages();
  nonFiniteAbility[0].data[0].evaluations.artificial_analysis_intelligence_index = Number.NaN;
  assert.throws(
    () => buildAaPublicSnapshot(nonFiniteAbility, { observedAt: "2026-09-04" }),
    /intelligence_index must be a finite number or null/,
  );

  const negativePrice = fixturePages();
  negativePrice[0].data[0].pricing.price_1m_output_tokens = -0.01;
  assert.throws(
    () => buildAaPublicSnapshot(negativePrice, { observedAt: "2026-09-04" }),
    /price_1m_output_tokens must be non-negative or null/,
  );

  const negativePerformance = fixturePages();
  negativePerformance[0].data[0].performance.median_output_tokens_per_second = -1;
  assert.throws(
    () => buildAaPublicSnapshot(negativePerformance, { observedAt: "2026-09-04" }),
    /median_output_tokens_per_second must be non-negative or null/,
  );

  const { snapshot } = buildFixture();
  assert.equal(snapshot.models.find((model) => model.sourceId === "model-epsilon").agentic, -5);
});

test("strictly validates normalized snapshots before reporting or rendering", () => {
  const { snapshot } = buildFixture();
  assert.deepEqual(validateAaPublicSnapshot(snapshot), snapshot);

  const unknownField = structuredClone(snapshot);
  unknownField.models[0].invented = 1;
  assert.throws(() => validateAaPublicSnapshot(unknownField), /missing or unexpected fields/);

  const wrongObservation = structuredClone(snapshot);
  wrongObservation.models[0].observedAt = "2026-09-03";
  assert.throws(() => renderAaPublicSnapshotModule(wrongObservation), /must match source.observedAt/);

  const declaredCount = structuredClone(snapshot);
  declaredCount.source.pagination.declaredTotalRows = 5;
  assert.throws(() => buildAaPublicReport(declaredCount), /must be null for Free v2/);

  const excessivePages = structuredClone(snapshot);
  excessivePages.source.pagination.totalPages = 51;
  assert.throws(
    () => validateAaPublicSnapshot(excessivePages),
    /exceeds the 50-page safety limit/,
  );

  assert.throws(
    () => buildAaPublicSnapshot(fixturePages(), { observedAt: "2026-02-30" }),
    /observedAt must be an ISO date/,
  );
});
