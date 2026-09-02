import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BENCHMARK_DATE, BENCHMARK_DEFINITIONS, OBJECTIVE_SNAPSHOT } from "../src/data/benchmarks";
import { AA_SNAPSHOT } from "../src/data/generated/aaSnapshot";
import { ARENA_SNAPSHOT } from "../src/data/generated/arenaSnapshot";
import { DATA_DATE, MODELS } from "../src/data/models";
import {
  MODELOPS_SCHEMA_VERSION,
  assertReviewedEvidenceBindings,
  assertSourceVersionBindings,
  parseModelAliasConfig,
  parsePricingConfig,
  parseProviderSourcesConfig,
  sortPricingEntries,
  type ArenaDimension,
  type ArenaEvidenceRecord,
  type BenchmarkDefinitionRecord,
  type BenchmarkEvidenceRecord,
  type CatalogModel,
  type ModelOpsCatalog,
  type ModelOpsEvidence,
  type ProviderSourceEntry,
} from "./modelops-data-schema";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedDirectory = resolve(projectRoot, "data/modelops/generated");
const paths = {
  aliases: resolve(projectRoot, "data/modelops/model-aliases.json"),
  pricing: resolve(projectRoot, "data/modelops/pricing.json"),
  providerSources: resolve(projectRoot, "data/modelops/provider-sources.json"),
  catalog: resolve(generatedDirectory, "catalog.json"),
  evidence: resolve(generatedDirectory, "evidence.json"),
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function assertFiniteOrNull(value: number | null, path: string): void {
  assert(value === null || (typeof value === "number" && Number.isFinite(value)), `${path} must be finite or null`);
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${path}: ${detail}`);
  }
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildBenchmarkDefinitions(): BenchmarkDefinitionRecord[] {
  const definitions = BENCHMARK_DEFINITIONS.map((definition) => ({
    ...definition,
    calibration: { ...definition.calibration },
  })).sort((left, right) => compareStrings(left.id, right.id));
  const ids = definitions.map((definition) => definition.id);
  assert(new Set(ids).size === ids.length, "BENCHMARK_DEFINITIONS contains duplicate IDs");
  return definitions;
}

function buildBenchmarkObservations(
  knownModelIds: ReadonlySet<string>,
  definitions: BenchmarkDefinitionRecord[],
): BenchmarkEvidenceRecord[] {
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
  const observations: BenchmarkEvidenceRecord[] = [];

  for (const [modelId, profile] of Object.entries(OBJECTIVE_SNAPSHOT).sort(([left], [right]) => compareStrings(left, right))) {
    assert(knownModelIds.has(modelId), `OBJECTIVE_SNAPSHOT contains unknown model ID ${modelId}`);
    assert(profile.modelId === modelId, `OBJECTIVE_SNAPSHOT key ${modelId} does not match profile.modelId ${profile.modelId}`);

    for (const [benchmarkId, observation] of Object.entries(profile.observations).sort(([left], [right]) => compareStrings(left, right))) {
      if (!observation) continue;
      const definition = definitionById.get(benchmarkId);
      assert(definition, `Observation ${modelId}/${benchmarkId} has no benchmark definition`);
      assert(observation.benchmarkId === benchmarkId, `Observation ${modelId}/${benchmarkId} has a mismatched benchmarkId`);
      assert(Number.isFinite(observation.value), `Observation ${modelId}/${benchmarkId} has a non-finite value`);
      assert(isNonEmptyString(observation.modelVersion), `Observation ${modelId}/${benchmarkId} has no concrete model version`);
      assert(isNonEmptyString(observation.observedAt), `Observation ${modelId}/${benchmarkId} has no observation date`);
      observations.push({
        modelId,
        benchmarkId: observation.benchmarkId,
        value: observation.value,
        modelVersion: observation.modelVersion,
        observedAt: observation.observedAt,
        definition: {
          ...definition,
          calibration: { ...definition.calibration },
        },
      });
    }
  }

  return observations;
}

function buildArenaObservations(knownModelIds: ReadonlySet<string>): ArenaEvidenceRecord[] {
  const observations: ArenaEvidenceRecord[] = [];
  const dimensions: ArenaDimension[] = ["agent", "text", "webdev"];

  for (const [modelId, metrics] of Object.entries(ARENA_SNAPSHOT.models).sort(([left], [right]) => compareStrings(left, right))) {
    assert(knownModelIds.has(modelId), `ARENA_SNAPSHOT contains unknown model ID ${modelId}`);
    for (const dimension of dimensions) {
      const metric = metrics[dimension];
      if (!metric) continue;
      assert(Number.isFinite(metric.value), `Arena observation ${modelId}/${dimension} has a non-finite value`);
      assertFiniteOrNull(metric.rank, `Arena observation ${modelId}/${dimension}.rank`);
      assertFiniteOrNull(metric.lower, `Arena observation ${modelId}/${dimension}.lower`);
      assertFiniteOrNull(metric.upper, `Arena observation ${modelId}/${dimension}.upper`);
      assertFiniteOrNull(metric.observations, `Arena observation ${modelId}/${dimension}.observations`);
      assert(isNonEmptyString(metric.category), `Arena observation ${modelId}/${dimension} has no category`);
      assert(isNonEmptyString(metric.observedAt), `Arena observation ${modelId}/${dimension} has no observation date`);
      assert(isNonEmptyString(metric.modelVersion), `Arena observation ${modelId}/${dimension} has no concrete model version`);
      observations.push({ modelId, dimension, ...metric });
    }
  }

  return observations;
}

function sortProviderSources(entries: ProviderSourceEntry[]): ProviderSourceEntry[] {
  return entries.map((entry) => ({ ...entry })).sort((left, right) => compareStrings(
    [left.modelId, left.providerId, left.providerModelId, left.kind, left.url].join("|"),
    [right.modelId, right.providerId, right.providerModelId, right.kind, right.url].join("|"),
  ));
}

function assertCatalogMatchesModels(catalog: ModelOpsCatalog): void {
  const sourceIds = MODELS.map((model) => model.id).sort(compareStrings);
  assert(new Set(sourceIds).size === sourceIds.length, "MODELS contains duplicate IDs");
  const catalogIds = catalog.models.map((model) => model.id);
  assert(new Set(catalogIds).size === catalogIds.length, "Generated catalog contains duplicate IDs");
  assert(JSON.stringify(catalogIds) === JSON.stringify(sourceIds), "Generated catalog IDs do not exactly match MODELS IDs");

  const sourceById = new Map(MODELS.map((model) => [model.id, model]));
  for (const model of catalog.models) {
    const source = sourceById.get(model.id);
    assert(source, `Generated catalog contains unknown model ID ${model.id}`);
    const { aliases: _aliases, ...catalogSourceFields } = model;
    assert(
      JSON.stringify(catalogSourceFields) === JSON.stringify(source),
      `Generated catalog changed source fields for ${model.id}`,
    );
  }
}

function assertEvidenceMatchesSources(
  evidence: ModelOpsEvidence,
  definitions: BenchmarkDefinitionRecord[],
): void {
  assert(
    JSON.stringify(evidence.benchmarkDefinitions) === JSON.stringify(definitions),
    "Generated benchmark definitions do not exactly match BENCHMARK_DEFINITIONS",
  );
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
  const seen = new Set<string>();

  for (const record of evidence.benchmarkObservations) {
    const key = `${record.modelId}|${record.benchmarkId}`;
    assert(!seen.has(key), `Generated benchmark observations contain duplicate ${key}`);
    seen.add(key);
    const profile = OBJECTIVE_SNAPSHOT[record.modelId];
    const source = profile?.observations[record.benchmarkId as keyof typeof profile.observations];
    assert(source, `Generated benchmark observation ${key} has no source observation`);
    assert(record.modelId === profile.modelId, `Generated benchmark observation ${key} changed modelId`);
    assert(record.benchmarkId === source.benchmarkId, `Generated benchmark observation ${key} changed benchmarkId`);
    assert(record.value === source.value, `Generated benchmark observation ${key} changed value`);
    assert(record.modelVersion === source.modelVersion, `Generated benchmark observation ${key} changed modelVersion`);
    assert(record.observedAt === source.observedAt, `Generated benchmark observation ${key} changed observedAt`);
    assert(
      JSON.stringify(record.definition) === JSON.stringify(definitionById.get(record.benchmarkId)),
      `Generated benchmark observation ${key} changed its source definition`,
    );
  }

  const sourceObservationCount = Object.values(OBJECTIVE_SNAPSHOT).reduce(
    (total, profile) => total + Object.values(profile.observations).filter(Boolean).length,
    0,
  );
  assert(
    evidence.benchmarkObservations.length === sourceObservationCount,
    "Generated benchmark evidence omitted source observations",
  );
}

async function buildOutputs(): Promise<{ catalog: ModelOpsCatalog; evidence: ModelOpsEvidence }> {
  const sourceIds = MODELS.map((model) => model.id);
  assert(new Set(sourceIds).size === sourceIds.length, "MODELS contains duplicate IDs");
  const knownModelIds = new Set(sourceIds);
  const [aliasConfig, pricingConfig, providerSourcesConfig] = await Promise.all([
    readJson(paths.aliases).then((value) => parseModelAliasConfig(value, knownModelIds)),
    readJson(paths.pricing).then((value) => parsePricingConfig(value, knownModelIds)),
    readJson(paths.providerSources).then((value) => parseProviderSourcesConfig(value, knownModelIds)),
  ]);
  assertReviewedEvidenceBindings(aliasConfig, pricingConfig, providerSourcesConfig);
  assertSourceVersionBindings(aliasConfig, OBJECTIVE_SNAPSHOT, AA_SNAPSHOT, ARENA_SNAPSHOT);
  const aliasesByModelId = new Map(aliasConfig.models.map((entry) => [entry.modelId, entry]));

  const models: CatalogModel[] = MODELS.map((model) => {
    const aliases = aliasesByModelId.get(model.id);
    assert(aliases, `No alias entry exists for ${model.id}`);
    return {
      ...model,
      badges: [...model.badges],
      strengths: [...model.strengths],
      weaknesses: [...model.weaknesses],
      sources: model.sources.map((source) => ({ ...source })),
      aliases: {
        aaSlugs: [...aliases.aaSlugs].sort(compareStrings),
        arenaNames: [...aliases.arenaNames].sort(compareStrings),
        benchmarkVersionIds: [...aliases.benchmarkVersionIds].sort(compareStrings),
        providerModels: aliases.providerModels
          .map((binding) => ({ ...binding }))
          .sort((left, right) => compareStrings(
            `${left.providerId}|${left.providerModelId}`,
            `${right.providerId}|${right.providerModelId}`,
          )),
      },
    };
  }).sort((left, right) => compareStrings(left.id, right.id));

  const catalog: ModelOpsCatalog = {
    schemaVersion: MODELOPS_SCHEMA_VERSION,
    dataDate: DATA_DATE,
    models,
  };
  const benchmarkDefinitions = buildBenchmarkDefinitions();
  const evidence: ModelOpsEvidence = {
    schemaVersion: MODELOPS_SCHEMA_VERSION,
    benchmarkDate: BENCHMARK_DATE,
    benchmarkDefinitions,
    benchmarkObservations: buildBenchmarkObservations(knownModelIds, benchmarkDefinitions),
    arena: {
      generatedAt: ARENA_SNAPSHOT.generatedAt,
      sourceUrl: ARENA_SNAPSHOT.sourceUrl,
      observations: buildArenaObservations(knownModelIds),
    },
    pricing: sortPricingEntries(pricingConfig.entries),
    providerSources: sortProviderSources(providerSourcesConfig.entries),
  };

  assertCatalogMatchesModels(catalog);
  assertEvidenceMatchesSources(evidence, benchmarkDefinitions);
  return { catalog, evidence };
}

async function checkGeneratedFile(path: string, expected: string): Promise<boolean> {
  try {
    return await readFile(path, "utf8") === expected;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "ENOENT") return false;
    throw error;
  }
}

async function run(): Promise<void> {
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--check");
  if (unknownArguments.length > 0) throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}`);
  const checkOnly = process.argv.includes("--check");
  const { catalog, evidence } = await buildOutputs();
  const outputs = [
    { path: paths.catalog, content: serialize(catalog) },
    { path: paths.evidence, content: serialize(evidence) },
  ];

  if (checkOnly) {
    const checks = await Promise.all(outputs.map(async (output) => ({
      path: output.path,
      current: await checkGeneratedFile(output.path, output.content),
    })));
    const drifted = checks.filter((check) => !check.current).map((check) => check.path);
    if (drifted.length > 0) {
      throw new Error(`Generated ModelOps data is missing or stale:\n${drifted.join("\n")}\nRun npm run modelops:data.`);
    }
    console.log("ModelOps generated data is current.");
    return;
  }

  await mkdir(generatedDirectory, { recursive: true });
  await Promise.all(outputs.map((output) => writeFile(output.path, output.content, "utf8")));
  console.log(`Wrote ${outputs.length} deterministic ModelOps data files.`);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ModelOps data export failed: ${message}`);
  process.exitCode = 1;
});
