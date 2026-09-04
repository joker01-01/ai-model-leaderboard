import { describe, expect, it } from "vitest";

import type { AaPublicModel } from "./aaPublicSnapshot";
import {
  compareUnicodeCodePoints,
  getAaNameSortKey,
  selectAaRanking,
  selectAbilityRanking,
  selectPriceRanking,
  selectSpeedRanking,
} from "./aaRankings";

function model(sourceId: string, overrides: Partial<AaPublicModel> = {}): AaPublicModel {
  return {
    sourceId,
    sourceSlug: `slug-${sourceId}`,
    rawName: `Model ${sourceId}`,
    creatorId: "creator-a",
    creatorName: "Creator A",
    releaseDate: null,
    observedAt: "2026-09-04",
    intelligence: null,
    coding: null,
    agentic: null,
    inputPricePerMillion: null,
    outputPricePerMillion: null,
    timeToFirstAnswerSeconds: null,
    outputTokensPerSecond: null,
    ...overrides,
  };
}

describe("AA public ranking selectors", () => {
  it("selects all three ability views independently in descending order", () => {
    const models = [
      model("alpha", { intelligence: 90, coding: 60, agentic: null }),
      model("beta", { intelligence: 80, coding: null, agentic: 95 }),
      model("gamma", { intelligence: null, coding: 99, agentic: 70 }),
    ];

    expect(selectAaRanking(models, "intelligence").map((row) => row.sourceId)).toEqual(["alpha", "beta"]);
    expect(selectAbilityRanking(models, "coding").map((row) => row.sourceId)).toEqual(["gamma", "alpha"]);
    expect(selectAaRanking(models, "agentic").map((row) => row.sourceId)).toEqual(["beta", "gamma"]);
  });

  it("requires both speed values and orders speed by output tokens per second", () => {
    const models = [
      model("fast", { timeToFirstAnswerSeconds: 2, outputTokensPerSecond: 200 }),
      model("responsive", { timeToFirstAnswerSeconds: 0.1, outputTokensPerSecond: 100 }),
      model("missing-ttfa", { outputTokensPerSecond: 300 }),
      model("missing-tps", { timeToFirstAnswerSeconds: 0.01 }),
    ];

    expect(selectSpeedRanking(models).map((row) => [row.sourceId, row.primaryValue])).toEqual([
      ["fast", 200],
      ["responsive", 100],
    ]);
  });

  it("requires both prices and orders price by output price from high to low", () => {
    const models = [
      model("premium", { inputPricePerMillion: 10, outputPricePerMillion: 50 }),
      model("budget", { inputPricePerMillion: 0, outputPricePerMillion: 0 }),
      model("missing-input", { outputPricePerMillion: 100 }),
      model("missing-output", { inputPricePerMillion: 100 }),
    ];

    expect(selectPriceRanking(models).map((row) => [row.sourceId, row.primaryValue])).toEqual([
      ["premium", 50],
      ["budget", 0],
    ]);
  });

  it("assigns competition ranks from the primary metric before deterministic tie breaking", () => {
    const models = [
      model("third", { rawName: "Zed", intelligence: 80 }),
      model("tie-z", { rawName: "Same", intelligence: 100 }),
      model("tie-a", { rawName: "Same", intelligence: 100 }),
    ];

    const rows = selectAbilityRanking(models, "intelligence");
    expect(rows.map((row) => [row.sourceId, row.rank])).toEqual([
      ["tie-a", 1],
      ["tie-z", 1],
      ["third", 3],
    ]);
  });

  it("uses true Unicode code-point ordering and the transparent unnamed fallback", () => {
    const supplementary = "\u{10000}";
    const privateUse = "\uE000";
    expect(compareUnicodeCodePoints(privateUse, supplementary)).toBeLessThan(0);

    const models = [
      model("supplementary", { rawName: supplementary, intelligence: 10 }),
      model("private", { rawName: privateUse, intelligence: 10 }),
      model("unnamed", { rawName: null, sourceSlug: null, intelligence: 0 }),
    ];
    expect(selectAbilityRanking(models, "intelligence").map((row) => row.sourceId)).toEqual([
      "private",
      "supplementary",
      "unnamed",
    ]);
    expect(getAaNameSortKey(models[2])).toBe("未命名模型 unnamed");
  });

  it("keeps global ranks when search or creator filters hide higher rows", () => {
    const models = [
      model("one", {
        rawName: "Alpha",
        creatorId: "creator-a",
        creatorName: "Maker Alpha",
        intelligence: 100,
      }),
      model("two", {
        rawName: "Beta",
        sourceSlug: "searchable-slug",
        creatorId: "creator-b",
        creatorName: "Maker Beta",
        intelligence: 90,
      }),
      model("search-id", {
        rawName: null,
        sourceSlug: null,
        creatorId: null,
        creatorName: null,
        intelligence: 80,
      }),
    ];

    expect(selectAaRanking(models, "intelligence", { creatorId: "creator-b" }).map((row) => row.rank)).toEqual([
      2,
    ]);
    expect(selectAaRanking(models, "intelligence", { creatorId: null }).map((row) => row.rank)).toEqual([3]);
    expect(selectAaRanking(models, "intelligence", { creatorId: undefined }).map((row) => row.rank)).toEqual([
      1,
      2,
      3,
    ]);
    expect(selectAaRanking(models, "intelligence", { query: "SEARCHABLE-SLUG" }).map((row) => row.rank)).toEqual([
      2,
    ]);
    expect(selectAaRanking(models, "intelligence", { query: "search-id" }).map((row) => row.rank)).toEqual([3]);
    expect(selectAaRanking(models, "intelligence", { query: "maker beta" }).map((row) => row.rank)).toEqual([2]);
  });

  it("preserves zero as a valid value and returns immutable result containers", () => {
    const ability = selectAbilityRanking([model("zero", { intelligence: 0 })], "intelligence");
    const speed = selectSpeedRanking([
      model("zero", { timeToFirstAnswerSeconds: 0, outputTokensPerSecond: 0 }),
    ]);

    expect(ability[0]).toEqual(expect.objectContaining({ primaryValue: 0, rank: 1 }));
    expect(speed[0]).toEqual(expect.objectContaining({ primaryValue: 0, rank: 1 }));
    expect(Object.isFrozen(ability)).toBe(true);
    expect(Object.isFrozen(ability[0])).toBe(true);
  });
});
