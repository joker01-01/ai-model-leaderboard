import { describe, expect, it } from "vitest";

import { niceAxisMaximum } from "./chartScale";

describe("niceAxisMaximum", () => {
  it.each([
    [452.6, 500],
    [1650.82, 2000],
    [600, 800],
    [150, 200],
    [100, 125],
    [0.00015, 0.0002],
  ])("adds readable headroom above %s", (maximum, expected) => {
    expect(niceAxisMaximum(maximum)).toBe(expected);
    expect(niceAxisMaximum(maximum)).toBeGreaterThan(maximum);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("returns zero for an unusable maximum %s", (maximum) => {
    expect(niceAxisMaximum(maximum)).toBe(0);
  });
});
