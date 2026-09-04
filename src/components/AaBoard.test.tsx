// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AaLeaderboardEntry } from "../lib/aaLeaderboard";
import AaBoard from "./AaBoard";

afterEach(cleanup);

function entry(sourceId: string, rank: number, value: number): AaLeaderboardEntry {
  return {
    sourceId,
    sourceSlug: "same-family",
    modelVersion: `Same Model (${sourceId})`,
    creatorId: "creator",
    creatorName: "Example Lab",
    releaseDate: null,
    value,
    observedAt: "2026-09-04",
    rank,
  };
}

describe("AaBoard", () => {
  it("keeps source configurations and their original ranks after filtering", () => {
    const entries = [entry("config-a", 1, 62.1), entry("config-b", 3, 60.9)];
    const { container } = render(
      <AaBoard entries={entries.slice(1)} expanded={null} sourceUrl="https://artificialanalysis.ai/leaderboards/models" onToggle={vi.fn()} />,
    );

    expect(container.querySelector(".rank")?.textContent).toBe("03");
    expect(container.textContent).toContain("Same Model (config-b)");
    expect(container.textContent).not.toContain("config-a");
  });

  it("shows missing source metadata explicitly without curated catalog fields", () => {
    const row = { ...entry("config-a", 1, 62.1), creatorId: null, creatorName: null };
    const { container } = render(
      <AaBoard entries={[row]} expanded="config-a" sourceUrl="https://artificialanalysis.ai/leaderboards/models" onToggle={vi.fn()} />,
    );

    expect(container.textContent).toContain("AA 未提供");
    expect(container.textContent).toContain("源 ID：config-a");
    expect(container.textContent).not.toContain("价格");
    expect(container.textContent).not.toContain("许可");
    expect(container.textContent).not.toContain("上下文");
  });
});
