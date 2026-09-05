import { describe, expect, it } from "vitest";

import { parseAaPublicSnapshot } from "./aaPublicSnapshot";

function model(sourceId: string, overrides: Record<string, unknown> = {}) {
  return {
    sourceId,
    sourceSlug: `slug-${sourceId}`,
    rawName: `Model ${sourceId}`,
    creatorId: "creator-a",
    creatorName: "Creator A",
    releaseDate: "2026-08-01",
    observedAt: "2026-09-04",
    intelligence: 50,
    coding: 40,
    agentic: 30,
    inputPricePerMillion: 1,
    outputPricePerMillion: 2,
    timeToFirstAnswerSeconds: 0.5,
    outputTokensPerSecond: 100,
    ...overrides,
  };
}

function snapshot(
  models = [model("one"), model("two")],
  sourceOverrides: Record<string, unknown> = {},
  paginationOverrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 1,
    source: {
      url: "https://artificialanalysis.ai/data-api/",
      observedAt: "2026-09-04",
      schemaFingerprint: "sha256:test-contract",
      intelligenceIndexVersion: 4.1,
      pagination: {
        pageSize: 2,
        totalPages: Math.max(1, Math.ceil(models.length / 2)),
        declaredTotalRows: null,
        fetchedRowCount: models.length,
        ...paginationOverrides,
      },
      ...sourceOverrides,
    },
    models,
  };
}

describe("parseAaPublicSnapshot", () => {
  it("parses and deeply freezes the strict public snapshot contract", () => {
    const parsed = parseAaPublicSnapshot(snapshot());

    expect(parsed).toEqual(snapshot());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.source)).toBe(true);
    expect(Object.isFrozen(parsed.source.pagination)).toBe(true);
    expect(Object.isFrozen(parsed.models)).toBe(true);
    expect(parsed.models.every(Object.isFrozen)).toBe(true);
  });

  it("keeps nullable identity text and genuine zero metrics", () => {
    const parsed = parseAaPublicSnapshot(snapshot([
      model("anonymous", {
        sourceSlug: null,
        rawName: null,
        creatorId: null,
        creatorName: null,
        releaseDate: null,
        intelligence: 0,
        coding: 0,
        agentic: 0,
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        timeToFirstAnswerSeconds: 0,
        outputTokensPerSecond: 0,
      }),
    ]));

    expect(parsed.models[0]).toEqual(expect.objectContaining({
      sourceSlug: null,
      rawName: null,
      intelligence: 0,
      inputPricePerMillion: 0,
      timeToFirstAnswerSeconds: 0,
    }));
  });

  it("rejects unknown, missing, and malformed fields", () => {
    expect(() => parseAaPublicSnapshot({ ...snapshot(), extra: true })).toThrow(/extra is not allowed/);
    const missingMetric = model("one");
    Reflect.deleteProperty(missingMetric, "agentic");
    expect(() => parseAaPublicSnapshot(snapshot([missingMetric]))).toThrow(/agentic is required/);
    expect(() => parseAaPublicSnapshot(snapshot([model("one", { coding: Number.NaN })]))).toThrow(/coding/);
    expect(() => parseAaPublicSnapshot(snapshot([model("one", { intelligence: Number.POSITIVE_INFINITY })]))).toThrow(
      /intelligence/,
    );
    expect(() => parseAaPublicSnapshot(snapshot([model("one", { outputPricePerMillion: -0.01 })]))).toThrow(
      /outputPricePerMillion.*non-negative/,
    );
    expect(() => parseAaPublicSnapshot(snapshot([model("one", { outputTokensPerSecond: -1 })]))).toThrow(
      /outputTokensPerSecond.*non-negative/,
    );
  });

  it("rejects duplicate or blank source identities", () => {
    expect(() => parseAaPublicSnapshot(snapshot([model("same"), model("same")]))).toThrow(/duplicate sourceId same/);
    expect(() => parseAaPublicSnapshot(snapshot([model(" ")]))).toThrow(/sourceId/);
  });

  it("requires the canonical sourceId storage order", () => {
    expect(() => parseAaPublicSnapshot(snapshot([model("two"), model("one")]))).toThrow(
      /sorted by sourceId ascending/,
    );
  });

  it("requires valid and consistent observation and release dates", () => {
    expect(() => parseAaPublicSnapshot(snapshot([model("one", { observedAt: "2026-09-03" })]))).toThrow(
      /observedAt must equal/,
    );
    expect(() => parseAaPublicSnapshot(snapshot([model("one", { releaseDate: "2026-02-30" })]))).toThrow(
      /releaseDate/,
    );
    expect(() => parseAaPublicSnapshot(snapshot(undefined, { observedAt: "2026-13-01" }))).toThrow(
      /source.observedAt/,
    );
  });

  it("accepts an absent declared total but rejects incomplete pagination proof", () => {
    const complete = snapshot([model("one"), model("three"), model("two")]);
    expect(parseAaPublicSnapshot(complete).models).toHaveLength(3);

    const fetchedMismatch = snapshot(undefined, {}, { fetchedRowCount: 1 });
    expect(() => parseAaPublicSnapshot(fetchedMismatch)).toThrow(/fetchedRowCount must equal models length/);

    const declaredMismatch = snapshot(undefined, {}, { declaredTotalRows: 3 });
    expect(() => parseAaPublicSnapshot(declaredMismatch)).toThrow(/declaredTotalRows must be null/);

    const empty = snapshot([], {}, { totalPages: 1, fetchedRowCount: 0 });
    expect(() => parseAaPublicSnapshot(empty)).toThrow(/fetchedRowCount.*greater than or equal to 1/);

    const pageMismatch = snapshot(
      [model("one"), model("three"), model("two")],
      {},
      { totalPages: 1 },
    );
    expect(() => parseAaPublicSnapshot(pageMismatch)).toThrow(/totalPages is inconsistent/);

    const excessivePages = snapshot(undefined, {}, { totalPages: 51 });
    expect(() => parseAaPublicSnapshot(excessivePages)).toThrow(/totalPages must be less than or equal to 50/);
  });

  it("requires schema and index metadata without silently coercing them", () => {
    expect(() => parseAaPublicSnapshot({ ...snapshot(), schemaVersion: "1" })).toThrow(/schemaVersion/);
    expect(() => parseAaPublicSnapshot(snapshot(undefined, { intelligenceIndexVersion: 0 }))).toThrow(
      /intelligenceIndexVersion must be positive/,
    );
    expect(() => parseAaPublicSnapshot(snapshot(undefined, { url: "http://artificialanalysis.ai/data-api/" }))).toThrow(
      /credential-free HTTPS URL/,
    );
    expect(() => parseAaPublicSnapshot(snapshot(undefined, { url: "https://artificialanalysis.ai/data-api/?page=1" }))).toThrow(
      /without a query or fragment/,
    );
    expect(() => parseAaPublicSnapshot(snapshot(undefined, { url: "https://artificialanalysis.ai/data-api/#models" }))).toThrow(
      /without a query or fragment/,
    );
  });
});
