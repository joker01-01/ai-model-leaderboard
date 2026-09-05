import { describe, expect, it } from "vitest";

import { alignedPreviewScaleMaximum, niceAxisMaximum } from "./chartScale";

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

describe("alignedPreviewScaleMaximum", () => {
  it("places a preview value on a requested in-plot endpoint without filling the plot", () => {
    const maximum = alignedPreviewScaleMaximum(65.7, 250, 900, 1085, 100);

    expect(maximum).toBeCloseTo(70.814371, 6);
    expect((65.7 / maximum) * 900 + 250).toBeCloseTo(1085, 6);
    expect(maximum).toBeGreaterThan(65.7);
  });

  it.each([
    [0, 250, 900, 1085],
    [65.7, 250, 0, 1085],
    [65.7, 250, 900, 250],
    [65.7, 250, 900, 1150],
    [Number.NaN, 250, 900, 1085],
  ])("keeps the fallback for unusable geometry %#", (value, left, width, targetRight) => {
    expect(alignedPreviewScaleMaximum(value, left, width, targetRight, 100)).toBe(100);
  });
});
