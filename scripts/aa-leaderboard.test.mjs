import assert from "node:assert/strict";
import test from "node:test";

import { AA_LEADERBOARD_LIMIT, buildAaLeaderboard } from "./aa-leaderboard.mjs";

function aaRow(index, intelligence, overrides = {}) {
  return {
    id: `source-${String(index).padStart(2, "0")}`,
    slug: `model-${index}`,
    name: `Model ${String(index).padStart(2, "0")}`,
    release_date: "2026-09-01",
    model_creator: { id: `creator-${index}`, name: `Creator ${index}` },
    evaluations: { artificial_analysis_intelligence_index: intelligence },
    ...overrides,
  };
}

test("selects exactly the highest-scoring 20 finite Intelligence entries", () => {
  const rows = Array.from({ length: 23 }, (_, index) => aaRow(index, index));
  rows[22] = aaRow(22, 22, { model_creator: null, release_date: null });
  rows.push(aaRow(99, null));

  const result = buildAaLeaderboard(rows, "2026-09-04");

  assert.equal(result.length, AA_LEADERBOARD_LIMIT);
  assert.deepEqual(result.map((entry) => entry.value), Array.from({ length: 20 }, (_, index) => 22 - index));
  assert.equal(result[0].sourceId, "source-22");
  assert.equal(result[0].creatorName, null);
  assert.equal(result[0].releaseDate, null);
  assert.equal(result.at(-1).sourceId, "source-03");
  assert.equal(result[0].observedAt, "2026-09-04");
});

test("keeps source configurations distinct and resolves equal scores deterministically", () => {
  const rows = Array.from({ length: 18 }, (_, index) => aaRow(index, 100 - index));
  rows.push(
    aaRow(90, 70, { id: "config-z", slug: "shared-family", name: "Shared Model (max)" }),
    aaRow(91, 70, { id: "config-a", slug: "shared-family", name: "Shared Model (max)" }),
  );

  const result = buildAaLeaderboard(rows, "2026-09-04");
  const shared = result.filter((entry) => entry.sourceSlug === "shared-family");

  assert.deepEqual(shared.map((entry) => entry.sourceId), ["config-a", "config-z"]);
});

test("fails closed when ranked rows are incomplete, duplicated, or malformed", () => {
  assert.throws(
    () => buildAaLeaderboard([aaRow(1, 1)], "2026-09-04"),
    /only 1 ranked models/,
  );

  const duplicate = Array.from({ length: 20 }, (_, index) => aaRow(index, index));
  duplicate[19] = aaRow(99, 99, { id: duplicate[0].id });
  assert.throws(() => buildAaLeaderboard(duplicate, "2026-09-04"), /duplicate source ID/);

  const malformed = Array.from({ length: 20 }, (_, index) => aaRow(index, index));
  malformed[0] = aaRow(0, 100, { model_creator: { id: "creator-0", name: "" } });
  assert.throws(() => buildAaLeaderboard(malformed, "2026-09-04"), /model_creator.name/);

  const invalidDate = Array.from({ length: 20 }, (_, index) => aaRow(index, index));
  invalidDate[0] = aaRow(0, 100, { release_date: "2026-02-31" });
  assert.throws(() => buildAaLeaderboard(invalidDate, "2026-09-04"), /release_date/);
  assert.throws(() => buildAaLeaderboard(malformed, null), /observedAt/);
});
