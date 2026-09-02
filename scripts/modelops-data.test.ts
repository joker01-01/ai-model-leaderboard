import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BENCHMARK_DEFINITIONS,
  OBJECTIVE_SNAPSHOT,
  calibrateBenchmarkValue,
  type BenchmarkId,
  type ObjectiveProfile,
} from "../src/data/benchmarks";
import { AA_SNAPSHOT } from "../src/data/generated/aaSnapshot";
import { ARENA_SNAPSHOT } from "../src/data/generated/arenaSnapshot";
import { MODELS, type Model } from "../src/data/models";
import { buildEditorialProfile } from "../src/lib/editorial";
import { compositePartial, DEFAULT_WEIGHTS, objectiveScore } from "../src/lib/score";
import {
  assertReviewedEvidenceBindings,
  assertSourceVersionBindings,
  isPricingEvidenceStale,
  parseModelAliasConfig,
  parsePricingConfig,
  parseProviderSourcesConfig,
  pricingEvidenceCutoff,
  sortPricingEntries,
  type ModelOpsCatalog,
  type ModelOpsEvidence,
  type PricingConfig,
  type ProviderSourcesConfig,
} from "./modelops-data-schema";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(projectRoot, path), "utf8")) as unknown;
}

async function loadReviewedInputs() {
  const knownModelIds = new Set(MODELS.map((model) => model.id));
  const [aliases, pricing, providerSources] = await Promise.all([
    readJson("data/modelops/model-aliases.json").then((value) => parseModelAliasConfig(value, knownModelIds)),
    readJson("data/modelops/pricing.json").then((value) => parsePricingConfig(value, knownModelIds)),
    readJson("data/modelops/provider-sources.json").then((value) => parseProviderSourcesConfig(value, knownModelIds)),
  ]);
  return { aliases, pricing, providerSources, knownModelIds };
}

function profilesFromEvidence(evidence: ModelOpsEvidence): Record<string, ObjectiveProfile> {
  const profiles: Record<string, ObjectiveProfile> = {};
  for (const record of evidence.benchmarkObservations) {
    const profile = profiles[record.modelId] ?? { modelId: record.modelId, observations: {} };
    profile.observations[record.benchmarkId as BenchmarkId] = {
      benchmarkId: record.benchmarkId as BenchmarkId,
      value: record.value,
      modelVersion: record.modelVersion,
      observedAt: record.observedAt,
    };
    profiles[record.modelId] = profile;
  }
  return profiles;
}

function rankingSnapshot(models: Model[], profiles: Record<string, ObjectiveProfile>) {
  const intelligenceDefinition = BENCHMARK_DEFINITIONS.find((definition) => definition.id === "aa-intelligence");
  assert(intelligenceDefinition);

  const rows = models.map((model) => {
    const profile = profiles[model.id];
    const intelligence = profile?.observations["aa-intelligence"];
    const publicScore = objectiveScore({
      intelligence: intelligence
        ? calibrateBenchmarkValue(intelligenceDefinition, intelligence.value)
        : undefined,
    }).score;
    const editorial = buildEditorialProfile(model, profile);
    const editorialScore = editorial.dims.intelligence == null
      ? null
      : compositePartial(editorial.dims, DEFAULT_WEIGHTS);
    return { id: model.id, name: model.name, publicScore, editorialScore };
  });

  const sortBy = (field: "publicScore" | "editorialScore") => [...rows]
    .sort((left, right) => {
      const leftScore = left[field];
      const rightScore = right[field];
      if ((leftScore === null) !== (rightScore === null)) return leftScore === null ? 1 : -1;
      if (leftScore !== null && rightScore !== null && leftScore !== rightScore) return rightScore - leftScore;
      return left.name.localeCompare(right.name, "zh-Hans-CN");
    })
    .map((row) => ({ id: row.id, score: row[field] }));

  return { public: sortBy("publicScore"), editorial: sortBy("editorialScore") };
}

test("reviewed ModelOps inputs satisfy the strict contracts", async () => {
  const { aliases, pricing, providerSources } = await loadReviewedInputs();
  assert.equal(pricing.entries.length, 9);
  assert.equal(providerSources.entries.length, 12);
  assert.doesNotThrow(() => assertReviewedEvidenceBindings(aliases, pricing, providerSources));
});

test("provider evidence cannot be rebound to an unregistered internal model", async () => {
  const { aliases, pricing, providerSources } = await loadReviewedInputs();
  const wrongBinding: PricingConfig = {
    ...pricing,
    entries: [{ ...pricing.entries[0], providerModelId: "unregistered-provider-model" }, ...pricing.entries.slice(1)],
  };
  assert.throws(
    () => assertReviewedEvidenceBindings(aliases, wrongBinding, providerSources),
    /provider binding .* is not registered/,
  );
});

test("provider IDs cannot be swapped for the same provider-model string", async () => {
  const { aliases, pricing, providerSources } = await loadReviewedInputs();
  const wrongProvider: PricingConfig = structuredClone(pricing);
  const qwenEntry = wrongProvider.entries.find((entry) => entry.modelId === "qwen-3-5");
  assert(qwenEntry);
  qwenEntry.providerId = "qwen";
  assert.throws(
    () => assertReviewedEvidenceBindings(aliases, wrongProvider, providerSources),
    /provider binding .* is not registered/,
  );
});

test("pricing tiers reject gaps and non-30-day review deadlines", async () => {
  const { pricing, knownModelIds } = await loadReviewedInputs();
  const gap = structuredClone(pricing);
  const secondTier = gap.entries.find(
    (entry) => entry.offerId === "alibaba-qwen-3-5-cn-beijing-usd" && entry.minInputTokensExclusive > 0,
  );
  assert(secondTier);
  secondTier.minInputTokensExclusive += 1;
  assert.throws(() => parsePricingConfig(gap, knownModelIds), /contiguous and non-overlapping/);

  const stale = structuredClone(pricing);
  stale.entries[0].staleAfter = "2099-01-01";
  assert.throws(() => parsePricingConfig(stale, knownModelIds), /must be exactly 30 calendar days/);
});

test("pricing rejects currency codes outside the controlled contract", async () => {
  const { pricing, knownModelIds } = await loadReviewedInputs();
  const unsupportedCurrency = structuredClone(pricing) as unknown as { entries: Array<{ currency: string }> };
  unsupportedCurrency.entries[0].currency = "ZZZ";
  assert.throws(
    () => parsePricingConfig(unsupportedCurrency, knownModelIds),
    /unsupported currency/,
  );
});

test("pricing evidence date must match the reviewed pricing source date", async () => {
  const { aliases, pricing, providerSources } = await loadReviewedInputs();
  const mismatchedSourceDate: ProviderSourcesConfig = structuredClone(providerSources);
  const pricingSource = mismatchedSourceDate.entries.find((entry) => (
    entry.kind === "pricing"
    && entry.modelId === pricing.entries[0].modelId
    && entry.url === pricing.entries[0].sourceUrl
  ));
  assert(pricingSource);
  pricingSource.observedAt = "2026-09-01";
  assert.throws(
    () => assertReviewedEvidenceBindings(aliases, pricing, mismatchedSourceDate),
    /pricing source is not allowlisted/,
  );
});

test("pricing evidence uses the earlier inclusive review or provider cutoff", async () => {
  const { pricing } = await loadReviewedInputs();
  const reviewed = pricing.entries[0];
  assert.equal(pricingEvidenceCutoff(reviewed), "2026-10-02");
  assert.equal(isPricingEvidenceStale(reviewed, "2026-10-02"), false);
  assert.equal(isPricingEvidenceStale(reviewed, "2026-10-03"), true);

  const providerLimited = { ...reviewed, validThrough: "2026-09-20" };
  assert.equal(pricingEvidenceCutoff(providerLimited), "2026-09-20");
  assert.equal(isPricingEvidenceStale(providerLimited, "2026-09-20"), false);
  assert.equal(isPricingEvidenceStale(providerLimited, "2026-09-21"), true);
});

test("provider document hosts are constrained by provider ID", async () => {
  const { providerSources, knownModelIds } = await loadReviewedInputs();
  const wrongHost: ProviderSourcesConfig = structuredClone(providerSources);
  wrongHost.entries[0].url = "https://example.com/not-reviewed";
  assert.throws(() => parseProviderSourcesConfig(wrongHost, knownModelIds), /host is not allowlisted/);
});

test("benchmark, AA, and Arena rows require exact registered source versions", async () => {
  const { aliases } = await loadReviewedInputs();
  assert.doesNotThrow(() => assertSourceVersionBindings(
    aliases,
    OBJECTIVE_SNAPSHOT,
    AA_SNAPSHOT,
    ARENA_SNAPSHOT,
  ));

  const wrongAa = structuredClone(AA_SNAPSHOT);
  const aaMetric = wrongAa.models["gpt-56-sol"]?.intelligence;
  assert(aaMetric);
  aaMetric.sourceSlug = "gpt-5-6-sol-unreviewed";
  assert.throws(
    () => assertSourceVersionBindings(aliases, OBJECTIVE_SNAPSHOT, wrongAa, ARENA_SNAPSHOT),
    /AA sourceSlug .* is not registered/,
  );

  const wrongStatic = structuredClone(OBJECTIVE_SNAPSHOT);
  const staticObservation = wrongStatic["deepseek-v4-pro"]?.observations["gpqa-diamond"];
  assert(staticObservation);
  staticObservation.modelVersion = "deepseek-v4-family";
  assert.throws(
    () => assertSourceVersionBindings(aliases, wrongStatic, AA_SNAPSHOT, ARENA_SNAPSHOT),
    /benchmark modelVersion .* is not registered/,
  );

  const wrongArena = structuredClone(ARENA_SNAPSHOT);
  const arenaMetric = wrongArena.models["claude-opus-4-8"]?.text;
  assert(arenaMetric);
  arenaMetric.modelVersion = "Claude Opus family";
  assert.throws(
    () => assertSourceVersionBindings(aliases, OBJECTIVE_SNAPSHOT, AA_SNAPSHOT, wrongArena),
    /Arena modelVersion .* is not registered/,
  );
});

test("pricing tier export ordering compares token boundaries numerically", async () => {
  const { pricing } = await loadReviewedInputs();
  const template = pricing.entries[0];
  const ninetyThousand = {
    ...template,
    offerId: "numeric-sort-probe",
    minInputTokensExclusive: 90000,
    maxInputTokensInclusive: 100000,
  };
  const oneHundredThousand = {
    ...template,
    offerId: "numeric-sort-probe",
    minInputTokensExclusive: 100000,
    maxInputTokensInclusive: 110000,
  };
  assert.deepEqual(
    sortPricingEntries([oneHundredThousand, ninetyThousand]).map((entry) => entry.minInputTokensExclusive),
    [90000, 100000],
  );
});

test("generated adapter preserves public and editorial ranking results", async () => {
  const [catalog, evidence] = await Promise.all([
    readJson("data/modelops/generated/catalog.json") as Promise<ModelOpsCatalog>,
    readJson("data/modelops/generated/evidence.json") as Promise<ModelOpsEvidence>,
  ]);
  const sourceRanking = rankingSnapshot(MODELS, OBJECTIVE_SNAPSHOT);
  const generatedRanking = rankingSnapshot(catalog.models, profilesFromEvidence(evidence));
  assert.deepEqual(generatedRanking, sourceRanking);
});
