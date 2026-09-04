// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { buildEntries, sortEntries } from "../lib/entries";
import { DEFAULT_WEIGHTS } from "../lib/score";
import Board from "./Board";

afterEach(cleanup);

describe("Board", () => {
  it("shows competition ranks for exact editorial ties", () => {
    const opennessScores = [100, 100, 0, 0];
    const entries = sortEntries(
      buildEntries(DEFAULT_WEIGHTS).slice(0, opennessScores.length).map((entry, index) => ({
        ...entry,
        editorialScore: 50,
        editorialDims: { ...entry.editorialDims, openness: opennessScores[index] },
      })),
      "editorial",
      "openness",
    );
    const { container } = render(
      <Board
        mode="editorial"
        entries={entries}
        sortKey="openness"
        expanded={null}
        onToggle={vi.fn()}
      />,
    );

    const rankedList = container.querySelector(".board > .rows");
    expect(rankedList).toBeTruthy();
    const rows = Array.from(rankedList?.children ?? []);
    const rowsByScore = (score: string) => rows.filter((row) => (
      row.querySelector(".score-num")?.textContent === score
    ));

    const openRows = rowsByScore("100.0");
    expect(openRows).toHaveLength(2);
    expect(openRows.map((row) => row.querySelector(".rank")?.textContent)).toEqual(["01", "01"]);

    const closedRows = rowsByScore("0.0");
    expect(closedRows).toHaveLength(2);
    expect(closedRows.map((row) => row.querySelector(".rank")?.textContent)).toEqual(["03", "03"]);
  });
});
