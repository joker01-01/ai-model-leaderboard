import { describe, expect, it } from "vitest";

import { buildAaLeaderboardEntries } from "./aaLeaderboard";

function syncedEntry(index: number, value: number, overrides: Record<string, unknown> = {}) {
  return {
    sourceId: `source-${String(index).padStart(2, "0")}`,
    sourceSlug: `model-${index}`,
    modelVersion: `Model ${String(index).padStart(2, "0")}`,
    creatorId: `creator-${index}`,
    creatorName: `Creator ${index}`,
    releaseDate: null,
    value,
    observedAt: "2026-09-04",
    ...overrides,
  };
}

describe("buildAaLeaderboardEntries", () => {
  it("keeps source configurations distinct and assigns competition ranks before filtering", () => {
    const intelligenceLeaderboard = Array.from({ length: 18 }, (_, index) => syncedEntry(index, 100 - index));
    intelligenceLeaderboard.push(
      syncedEntry(90, 70, { sourceId: "config-z", sourceSlug: "shared-model", modelVersion: "Shared Model (max)" }),
      syncedEntry(91, 70, { sourceId: "config-a", sourceSlug: "shared-model", modelVersion: "Shared Model (max)" }),
    );

    const entries = buildAaLeaderboardEntries({ intelligenceIndexVersion: 4.1, intelligenceLeaderboard });
    const shared = entries.filter((entry) => entry.sourceSlug === "shared-model");

    expect(shared.map((entry) => entry.sourceId)).toEqual(["config-a", "config-z"]);
    expect(shared.map((entry) => entry.rank)).toEqual([19, 19]);
  });

  it("stays unavailable instead of presenting curated matches as the public source board", () => {
    const entries = buildAaLeaderboardEntries({
      models: {
        curated: {
          intelligence: {
            sourceId: "aa-current",
            sourceSlug: "aa-current-slug",
            modelVersion: "AA Current (max)",
            value: 61.2,
            observedAt: "2026-09-04",
          },
        },
      },
    });

    expect(entries).toEqual([]);
  });

  it("rejects malformed generated leaderboard data", () => {
    const intelligenceLeaderboard = Array.from({ length: 20 }, (_, index) => syncedEntry(index, 100 - index));
    intelligenceLeaderboard[0] = syncedEntry(0, 100, { creatorName: "" });

    expect(() => buildAaLeaderboardEntries({ intelligenceIndexVersion: 4.1, intelligenceLeaderboard })).toThrow(/creatorName/);
  });

  it("preserves missing creator metadata as missing", () => {
    const intelligenceLeaderboard = Array.from({ length: 20 }, (_, index) => syncedEntry(index, 100 - index));
    intelligenceLeaderboard[0] = syncedEntry(0, 100, { creatorId: null, creatorName: null });

    expect(buildAaLeaderboardEntries({
      intelligenceIndexVersion: 4.1,
      intelligenceLeaderboard,
    })[0]).toEqual(expect.objectContaining({ creatorId: null, creatorName: null }));
  });

  it("requires a valid index version with a complete generated leaderboard", () => {
    const intelligenceLeaderboard = Array.from({ length: 20 }, (_, index) => syncedEntry(index, 100 - index));

    expect(() => buildAaLeaderboardEntries({ intelligenceLeaderboard })).toThrow(/intelligenceIndexVersion/);
    expect(() => buildAaLeaderboardEntries({
      intelligenceIndexVersion: 0,
      intelligenceLeaderboard,
    })).toThrow(/positive finite number/);
  });

  it("rejects mixed observation dates and invalid calendar dates", () => {
    const mixed = Array.from({ length: 20 }, (_, index) => syncedEntry(index, 100 - index));
    mixed[19] = syncedEntry(19, 81, { observedAt: "2026-09-03" });
    expect(() => buildAaLeaderboardEntries({
      intelligenceIndexVersion: 4.1,
      intelligenceLeaderboard: mixed,
    })).toThrow(/share one observedAt/);

    const invalid = Array.from({ length: 20 }, (_, index) => syncedEntry(index, 100 - index));
    invalid[0] = syncedEntry(0, 100, { releaseDate: "2026-02-31" });
    expect(() => buildAaLeaderboardEntries({
      intelligenceIndexVersion: 4.1,
      intelligenceLeaderboard: invalid,
    })).toThrow(/releaseDate/);
  });
});
