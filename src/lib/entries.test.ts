import { describe, expect, it } from "vitest";

import { DIM_KEYS, OBJECTIVE_DIM_KEYS, DEFAULT_WEIGHTS } from "./score";
import { buildEntries, entryValue, sortEntries, type RankingMode, type SortKey } from "./entries";
import { competitionRanks } from "./ranking";

function rankedValues(mode: RankingMode, sortKey: SortKey): number[] {
  return sortEntries(buildEntries(DEFAULT_WEIGHTS), mode, sortKey)
    .filter((entry) => (
      mode === "objective" ? entry.objectiveScore.score !== null : entry.editorialScore !== null
    ))
    .map((entry) => entryValue(entry, mode, sortKey));
}

describe("sortEntries", () => {
  it.each([
    ...OBJECTIVE_DIM_KEYS.map((key) => ["objective", key] as const),
    ...DIM_KEYS.map((key) => ["editorial", key] as const),
  ])("keeps missing %s %s values after every finite value", (mode, sortKey) => {
    const values = rankedValues(mode, sortKey);
    const firstMissing = values.findIndex((value) => !Number.isFinite(value));

    if (firstMissing !== -1) {
      expect(values.slice(firstMissing).every((value) => !Number.isFinite(value))).toBe(true);
      const ranks = competitionRanks(values);
      expect(new Set(ranks.slice(firstMissing)).size).toBe(1);
    }
  });
});
