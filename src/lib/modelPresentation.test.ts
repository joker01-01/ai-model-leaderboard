import { describe, expect, it } from "vitest";

import { AA_PUBLIC_SNAPSHOT } from "../data/generated/aaPublicSnapshot";
import { parseAaPublicSnapshot, type AaPublicModel } from "./aaPublicSnapshot";
import {
  AA_FEATURED_CREATORS,
  buildAaModelPresentationIndex,
  filterPresentedRanking,
  getAaCreatorTone,
} from "./modelPresentation";

function model(sourceId: string, overrides: Partial<AaPublicModel> = {}): AaPublicModel {
  return {
    sourceId,
    sourceSlug: `slug-${sourceId}`,
    rawName: `Model ${sourceId}`,
    creatorId: null,
    creatorName: null,
    releaseDate: null,
    observedAt: "2026-09-04",
    intelligence: 10,
    coding: null,
    agentic: null,
    inputPricePerMillion: null,
    outputPricePerMillion: null,
    timeToFirstAnswerSeconds: null,
    outputTokensPerSecond: null,
    ...overrides,
  };
}

describe("AA model presentation", () => {
  it("shortens the confirmed Claude example and normalizes effort labels", () => {
    const models = [
      model("fable", {
        rawName: "Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback)",
      }),
      model("xhigh", { rawName: "Claude Opus 5 (Adaptive Reasoning, Xhigh Effort)" }),
    ];
    const index = buildAaModelPresentationIndex(models);

    expect(index.get("fable")?.displayName).toBe("Fable 5.1 (Max)");
    expect(index.get("xhigh")?.displayName).toBe("Opus 5 (XHigh)");
  });

  it("adds compact reasoning only when otherwise equal labels collide", () => {
    const models = [
      model("reasoning", { rawName: "Model X (Reasoning, high)" }),
      model("plain", { rawName: "Model X (high)" }),
      model("non", { rawName: "Model X (Non-reasoning, high)" }),
      model("unique", { rawName: "Model Y (Reasoning, medium)" }),
    ];
    const index = buildAaModelPresentationIndex(models);

    expect(index.get("reasoning")?.displayName).toBe("Model X (High·R)");
    expect(index.get("plain")?.displayName).toBe("Model X (High)");
    expect(index.get("non")?.displayName).toBe("Model X (High·NR)");
    expect(index.get("unique")?.displayName).toBe("Model Y (Medium)");
  });

  it("uses R and NR alone or after effort regardless of source token and input order", () => {
    const models = [
      model("reasoning-only", { rawName: "Mode Reasoning" }),
      model("non-only", { rawName: "Mode Non-reasoning" }),
      model("reasoning-effort", { rawName: "Configured (Reasoning, Max Effort)" }),
      model("non-effort", { rawName: "Configured (Max Effort, Non-reasoning)" }),
    ];
    const forward = buildAaModelPresentationIndex(models);
    const reverse = buildAaModelPresentationIndex([...models].reverse());

    expect(forward.get("reasoning-only")?.displayName).toBe("Mode (R)");
    expect(forward.get("non-only")?.displayName).toBe("Mode (NR)");
    expect(forward.get("reasoning-effort")?.displayName).toBe("Configured (Max·R)");
    expect(forward.get("non-effort")?.displayName).toBe("Configured (Max·NR)");
    for (const item of models) {
      expect(reverse.get(item.sourceId)?.displayName).toBe(
        forward.get(item.sourceId)?.displayName,
      );
    }
  });

  it("uses non-default fallback, a shortest slug suffix, then sourceId for residual collisions", () => {
    const models = [
      model("a", { sourceSlug: "same-alpha", rawName: "Twin (Reasoning, Alt Fallback)" }),
      model("b", { sourceSlug: "same-beta", rawName: "Twin (Reasoning, Other Fallback)" }),
      model("c", { sourceSlug: "same-gamma", rawName: "Clone" }),
      model("d", { sourceSlug: "same-delta", rawName: "Clone" }),
      model("e", { sourceSlug: null, rawName: "No Slug" }),
      model("f", { sourceSlug: null, rawName: "No Slug" }),
    ];
    const index = buildAaModelPresentationIndex(models);

    expect(index.get("a")?.displayName).toContain("Alt Fallback");
    expect(index.get("b")?.displayName).toContain("Other Fallback");
    expect(index.get("c")?.displayName).toBe("Clone (gamma)");
    expect(index.get("d")?.displayName).toBe("Clone (delta)");
    expect(index.get("e")?.displayName).toBe("No Slug (e)");
    expect(index.get("f")?.displayName).toBe("No Slug (f)");
  });

  it("omits shared reasoning and fallback qualifiers that cannot distinguish a collision", () => {
    const models = [
      model("a", {
        sourceSlug: "alpha-shared-v1",
        rawName: "Twin (Reasoning, Shared Fallback)",
      }),
      model("b", {
        sourceSlug: "beta-shared-v1",
        rawName: "Twin (Reasoning, Shared Fallback)",
      }),
    ];
    const index = buildAaModelPresentationIndex(models);

    expect(index.get("a")?.displayName).toBe("Twin (alpha)");
    expect(index.get("b")?.displayName).toBe("Twin (beta)");
  });

  it("preserves substantive parenthetical placement and cleans configuration outside parentheses", () => {
    const models = [
      model("middle", { rawName: "Middle (Preview) Name" }),
      model("outside", {
        rawName: "Outside Adaptive Reasoning Max Effort Default Fallback",
      }),
      model("fullwidth", {
        rawName: "Claude Wide（Adaptive Reasoning, low Effort, Default Fallback）Preview",
      }),
    ];
    const index = buildAaModelPresentationIndex(models);

    expect(index.get("middle")?.displayName).toBe("Middle（Preview） Name");
    expect(index.get("outside")?.displayName).toBe("Outside Max");
    expect(index.get("fullwidth")?.displayName).toBe("Wide（Low）Preview");
  });

  it("uses the shortest visible slug part and defers outside qualifiers until a collision", () => {
    const models = [
      model("slug-a", { sourceSlug: "x-verylongunique", rawName: "Slug Twin" }),
      model("slug-b", { sourceSlug: "y-other", rawName: "Slug Twin" }),
      model("reasoning", { sourceSlug: "mode-reasoning", rawName: "Mode Reasoning" }),
      model("non", { sourceSlug: "mode-non", rawName: "Mode Non-reasoning" }),
      model("fallback-a", { rawName: "Route Opus 4.8 Fallback" }),
      model("fallback-b", { rawName: "Route Sonnet 4.7 Fallback" }),
    ];
    const index = buildAaModelPresentationIndex(models);

    expect(index.get("slug-a")?.displayName).toBe("Slug Twin (x)");
    expect(index.get("slug-b")?.displayName).toBe("Slug Twin (y)");
    expect(index.get("reasoning")?.displayName).toBe("Mode (R)");
    expect(index.get("non")?.displayName).toBe("Mode (NR)");
    expect(index.get("fallback-a")?.displayName).toBe("Route (Opus 4.8 Fallback)");
    expect(index.get("fallback-b")?.displayName).toBe("Route (Sonnet 4.7 Fallback)");
  });

  it("keeps nullable name fallbacks transparent and results independent from input order", () => {
    const models = [
      model("slug-only", { rawName: null, sourceSlug: "raw-source-slug" }),
      model("missing", { rawName: null, sourceSlug: null }),
    ];
    const forward = buildAaModelPresentationIndex(models);
    const reverse = buildAaModelPresentationIndex([...models].reverse());

    expect(forward.get("slug-only")?.displayName).toBe("raw-source-slug");
    expect(forward.get("missing")?.displayName).toBe("未命名模型 missing");
    expect(reverse.get("slug-only")?.displayName).toBe(forward.get("slug-only")?.displayName);
    expect(reverse.get("missing")?.displayName).toBe(forward.get("missing")?.displayName);
  });

  it("matches five featured brands strictly by creatorId and uses an initial otherwise", () => {
    const featured = AA_FEATURED_CREATORS.map((creator) => model(creator.brand, {
      creatorId: creator.creatorId,
      creatorName: creator.brand === "xai" ? "SpaceXAI" : creator.label,
    }));
    const sameNameWrongId = model("wrong", { creatorId: "wrong-id", creatorName: "OpenAI" });
    const index = buildAaModelPresentationIndex([...featured, sameNameWrongId]);

    for (const creator of AA_FEATURED_CREATORS) {
      expect(index.get(creator.brand)?.creatorBrand).toBe(creator.brand);
    }
    expect(index.get("wrong")?.creatorBrand).toBeNull();
    expect(index.get("wrong")?.creatorInitial).toBe("O");
  });

  it("resolves creator colors strictly by exact creatorId", () => {
    for (const creator of AA_FEATURED_CREATORS) {
      expect(getAaCreatorTone(creator.creatorId)).toBe(creator.brand);
    }
    expect(getAaCreatorTone("wrong-id")).toBe("other");
    expect(getAaCreatorTone(null)).toBe("other");
  });

  it("searches the simplified label and preserves already assigned ranks", () => {
    const source = model("one", {
      rawName: "Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback)",
      creatorId: "anthropic",
      creatorName: "Anthropic",
    });
    const row = Object.freeze({ ...source, rank: 9, primaryValue: 10 });
    const index = buildAaModelPresentationIndex([source]);

    expect(filterPresentedRanking([row], index, "Fable 5.1 (Max)", undefined)[0]?.rank).toBe(9);
    expect(filterPresentedRanking([row], index, "", "other")).toHaveLength(0);
  });

  it("keeps every live display label unique after removing the leading Claude brand", () => {
    const models = parseAaPublicSnapshot(AA_PUBLIC_SNAPSHOT).models;
    const index = buildAaModelPresentationIndex(models);
    const labels = Array.from(index.values(), (presentation) => presentation.displayName);

    expect(index.size).toBe(models.length);
    expect(new Set(labels).size).toBe(models.length);
    expect(labels.some((label) => /^Claude\s/iu.test(label))).toBe(false);
  });
});
