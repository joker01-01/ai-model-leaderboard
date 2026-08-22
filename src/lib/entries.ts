import type { DimKey, Model } from "../data/models";
import { MODELS } from "../data/models";
import {
  BENCHMARK_DEFINITIONS,
  calibrateBenchmarkValue,
  OBJECTIVE_SNAPSHOT,
  type BenchmarkDefinition,
  type BenchmarkId,
  type BenchmarkObservation,
} from "../data/benchmarks";
import { buildEditorialProfile } from "./editorial";
import type { ObjectiveDimKey, Weights } from "./score";
import { compositePartial, objectiveScore, OBJECTIVE_DIM_KEYS } from "./score";

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
    if (mode === "objective") {
      const aHas = a.objectiveScore.score !== null;
      const bHas = b.objectiveScore.score !== null;
      if (aHas !== bHas) return aHas ? -1 : 1;
      const scoreDifference = entryValue(b, mode, sortKey) - entryValue(a, mode, sortKey);
      return Number.isFinite(scoreDifference) && scoreDifference !== 0
        ? scoreDifference
        : a.model.name.localeCompare(b.model.name, "zh-Hans-CN");
    }
    const aHas = a.editorialScore !== null;
    const bHas = b.editorialScore !== null;
    if (aHas !== bHas) return aHas ? -1 : 1;
    const scoreDifference = entryValue(b, mode, sortKey) - entryValue(a, mode, sortKey);
    if (Number.isFinite(scoreDifference) && scoreDifference !== 0) return scoreDifference;
    const editorialDifference = (b.editorialScore ?? Number.NEGATIVE_INFINITY) - (a.editorialScore ?? Number.NEGATIVE_INFINITY);
    return Number.isFinite(editorialDifference) && editorialDifference !== 0
      ? editorialDifference
      : a.model.name.localeCompare(b.model.name, "zh-Hans-CN");
  });
}

export function observationsForMap(observations: Partial<Record<BenchmarkId, BenchmarkObservation>>, dim: ObjectiveDimKey): Array<{ definition: BenchmarkDefinition; observation: BenchmarkObservation }> {
  return BENCHMARK_DEFINITIONS.flatMap((definition) => {
    if (definition.dim !== dim) return [];
    const observation = observations[definition.id];
    return observation ? [{ definition, observation }] : [];
  });
}

export function observationsFor(entry: Entry, dim: ObjectiveDimKey): Array<{ definition: BenchmarkDefinition; observation: BenchmarkObservation }> {
  return observationsForMap(entry.observations, dim);
}

export function buildEntries(weights: Weights): Entry[] {
  return MODELS.map((model) => {
    const profile = OBJECTIVE_SNAPSHOT[model.id];
    const objectiveDims: Partial<Record<ObjectiveDimKey, number>> = {};
    const observations = profile?.observations ?? {};
    OBJECTIVE_DIM_KEYS.forEach((dim) => {
      const values = observationsForMap(observations, dim).map(({ definition, observation }) => calibrateBenchmarkValue(definition, observation.value));
      if (values.length > 0) objectiveDims[dim] = values.reduce((sum, value) => sum + value, 0) / values.length;
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
