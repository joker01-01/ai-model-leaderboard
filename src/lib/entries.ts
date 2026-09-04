import {
  BENCHMARK_DEFINITIONS,
  OBJECTIVE_SNAPSHOT,
  calibrateBenchmarkValue,
  type BenchmarkDefinition,
  type BenchmarkId,
  type BenchmarkObservation,
} from "../data/benchmarks";
import { MODELS, type DimKey, type Model } from "../data/models";
import { buildEditorialProfile } from "./editorial";
import {
  compositePartial,
  OBJECTIVE_DIM_KEYS,
  objectiveScore,
  type ObjectiveDimKey,
  type Weights,
} from "./score";

export type RankingMode = "objective" | "editorial";
export type SortKey = DimKey | ObjectiveDimKey | "composite";

export interface Entry {
  model: Model;
  editorialScore: number | null;
  editorialDims: Partial<Record<DimKey, number>>;
  editorialCoverage: number;
  objectiveScore: ReturnType<typeof objectiveScore>;
  objectiveDims: Partial<Record<ObjectiveDimKey, number>>;
  observations: Partial<Record<BenchmarkId, BenchmarkObservation>>;
  objectiveSignalCount: number;
}

function observationsForMap(
  observations: Partial<Record<BenchmarkId, BenchmarkObservation>>,
  dim: ObjectiveDimKey,
): Array<{ definition: BenchmarkDefinition; observation: BenchmarkObservation }> {
  return BENCHMARK_DEFINITIONS.flatMap((definition) => {
    if (definition.dim !== dim) return [];
    const observation = observations[definition.id];
    return observation ? [{ definition, observation }] : [];
  });
}

export function buildEntries(weights: Weights): Entry[] {
  return MODELS.map((model) => {
    const profile = OBJECTIVE_SNAPSHOT[model.id];
    const objectiveDims: Partial<Record<ObjectiveDimKey, number>> = {};
    const observations = profile?.observations ?? {};
    OBJECTIVE_DIM_KEYS.forEach((dim) => {
      const values = observationsForMap(observations, dim).map(({ definition, observation }) => (
        calibrateBenchmarkValue(definition, observation.value)
      ));
      if (values.length > 0) {
        objectiveDims[dim] = values.reduce((sum, value) => sum + value, 0) / values.length;
      }
    });
    const editorial = buildEditorialProfile(model, profile);
    return {
      model,
      editorialScore: editorial.dims.intelligence == null ? null : compositePartial(editorial.dims, weights),
      editorialDims: editorial.dims,
      editorialCoverage: editorial.coverage,
      objectiveScore: objectiveScore(objectiveDims),
      objectiveDims,
      observations,
      objectiveSignalCount: Object.keys(observations).length,
    };
  });
}

export function entryValue(entry: Entry, mode: RankingMode, sortKey: SortKey): number {
  if (mode === "objective") {
    if (sortKey === "composite") return entry.objectiveScore.score ?? Number.NEGATIVE_INFINITY;
    return entry.objectiveDims[sortKey as ObjectiveDimKey] ?? Number.NEGATIVE_INFINITY;
  }
  if (sortKey === "composite") return entry.editorialScore ?? Number.NEGATIVE_INFINITY;
  return entry.editorialDims[sortKey as DimKey] ?? Number.NEGATIVE_INFINITY;
}

export function sortEntries(entries: Entry[], mode: RankingMode, sortKey: SortKey): Entry[] {
  return [...entries].sort((a, b) => {
    const aValue = entryValue(a, mode, sortKey);
    const bValue = entryValue(b, mode, sortKey);
    if (mode === "objective") {
      const aHas = a.objectiveScore.score !== null;
      const bHas = b.objectiveScore.score !== null;
      if (aHas !== bHas) return aHas ? -1 : 1;
      const aHasSortValue = Number.isFinite(aValue);
      const bHasSortValue = Number.isFinite(bValue);
      if (aHasSortValue !== bHasSortValue) return aHasSortValue ? -1 : 1;
      if (aHasSortValue && bHasSortValue && aValue !== bValue) return bValue - aValue;
      return a.model.name.localeCompare(b.model.name, "zh-Hans-CN");
    }
    const aHas = a.editorialScore !== null;
    const bHas = b.editorialScore !== null;
    if (aHas !== bHas) return aHas ? -1 : 1;
    const aHasSortValue = Number.isFinite(aValue);
    const bHasSortValue = Number.isFinite(bValue);
    if (aHasSortValue !== bHasSortValue) return aHasSortValue ? -1 : 1;
    if (aHasSortValue && bHasSortValue && aValue !== bValue) return bValue - aValue;
    const editorialDifference = (b.editorialScore ?? Number.NEGATIVE_INFINITY)
      - (a.editorialScore ?? Number.NEGATIVE_INFINITY);
    return Number.isFinite(editorialDifference) && editorialDifference !== 0
      ? editorialDifference
      : a.model.name.localeCompare(b.model.name, "zh-Hans-CN");
  });
}

export function observationsFor(
  entry: Entry,
  dim: ObjectiveDimKey,
): Array<{ definition: BenchmarkDefinition; observation: BenchmarkObservation }> {
  return observationsForMap(entry.observations, dim);
}
