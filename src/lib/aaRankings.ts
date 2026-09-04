import type { AaPublicModel } from "./aaPublicSnapshot";

export type AaAbilityMetric = "intelligence" | "coding" | "agentic";
export type AaRankingView = AaAbilityMetric | "speed" | "price";

export interface AaRankingFilters {
  readonly query?: string;
  readonly creatorId?: string | null;
}

export type AaRankedModel = Readonly<AaPublicModel & {
  rank: number;
  primaryValue: number;
}>;

export const AA_RANKING_VIEWS: readonly AaRankingView[] = Object.freeze([
  "intelligence",
  "coding",
  "agentic",
  "speed",
  "price",
]);

export function getAaNameSortKey(model: AaPublicModel): string {
  return model.rawName ?? model.sourceSlug ?? `未命名模型 ${model.sourceId}`;
}

export function compareUnicodeCodePoints(left: string, right: string): number {
  const leftCodePoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightCodePoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const sharedLength = Math.min(leftCodePoints.length, rightCodePoints.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftCodePoints[index] - rightCodePoints[index];
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  if (leftCodePoints.length === rightCodePoints.length) return 0;
  return leftCodePoints.length < rightCodePoints.length ? -1 : 1;
}

function primaryValue(model: AaPublicModel, view: AaRankingView): number | null {
  if (view === "speed") {
    return model.timeToFirstAnswerSeconds !== null && model.outputTokensPerSecond !== null
      ? model.outputTokensPerSecond
      : null;
  }
  if (view === "price") {
    return model.inputPricePerMillion !== null && model.outputPricePerMillion !== null
      ? model.outputPricePerMillion
      : null;
  }
  return model[view];
}

function compareRankableModels(
  left: { readonly model: AaPublicModel; readonly primaryValue: number },
  right: { readonly model: AaPublicModel; readonly primaryValue: number },
): number {
  if (left.primaryValue !== right.primaryValue) return left.primaryValue > right.primaryValue ? -1 : 1;
  const nameOrder = compareUnicodeCodePoints(getAaNameSortKey(left.model), getAaNameSortKey(right.model));
  if (nameOrder !== 0) return nameOrder;
  return compareUnicodeCodePoints(left.model.sourceId, right.model.sourceId);
}

function rankAll(models: readonly AaPublicModel[], view: AaRankingView): readonly AaRankedModel[] {
  const sorted = models
    .map((model) => ({ model, primaryValue: primaryValue(model, view) }))
    .filter(
      (entry): entry is { readonly model: AaPublicModel; readonly primaryValue: number } =>
        entry.primaryValue !== null,
    )
    .sort(compareRankableModels);

  let rank = 0;
  const ranked = sorted.map((entry, index) => {
    if (index === 0 || entry.primaryValue !== sorted[index - 1].primaryValue) rank = index + 1;
    return Object.freeze({ ...entry.model, rank, primaryValue: entry.primaryValue });
  });
  return Object.freeze(ranked);
}

function matchesQuery(model: AaPublicModel, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === "") return true;
  return [
    getAaNameSortKey(model),
    model.rawName,
    model.sourceSlug,
    model.sourceId,
    model.creatorName,
  ].some((value) => value?.toLowerCase().includes(normalizedQuery) === true);
}

export function filterAaRanking(
  rankedModels: readonly AaRankedModel[],
  filters: AaRankingFilters = {},
): readonly AaRankedModel[] {
  const hasCreatorFilter = filters.creatorId !== undefined;
  const filtered = rankedModels.filter(
    (model) =>
      (!hasCreatorFilter || model.creatorId === filters.creatorId) &&
      (filters.query === undefined || matchesQuery(model, filters.query)),
  );
  return Object.freeze(filtered);
}

export function selectAaRanking(
  models: readonly AaPublicModel[],
  view: AaRankingView,
  filters: AaRankingFilters = {},
): readonly AaRankedModel[] {
  return filterAaRanking(rankAll(models, view), filters);
}

export function selectAbilityRanking(
  models: readonly AaPublicModel[],
  metric: AaAbilityMetric,
  filters: AaRankingFilters = {},
): readonly AaRankedModel[] {
  return selectAaRanking(models, metric, filters);
}

export function selectSpeedRanking(
  models: readonly AaPublicModel[],
  filters: AaRankingFilters = {},
): readonly AaRankedModel[] {
  return selectAaRanking(models, "speed", filters);
}

export function selectPriceRanking(
  models: readonly AaPublicModel[],
  filters: AaRankingFilters = {},
): readonly AaRankedModel[] {
  return selectAaRanking(models, "price", filters);
}
