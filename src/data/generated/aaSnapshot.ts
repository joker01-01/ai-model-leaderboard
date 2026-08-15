/**
 * 由 `npm run sync:data` 生成。
 * 初始版本刻意为空：在首次通过 Artificial Analysis 官方 API 核验前，页面继续使用人工核验快照。
 */
export interface SyncedAaMetric {
  value: number;
  modelVersion: string;
  observedAt: string;
  sourceId: string;
  sourceSlug: string;
}

export interface AaSnapshot {
  generatedAt: string | null;
  source: "Artificial Analysis Data API" | "manual";
  sourceUrl: string;
  models: Record<string, Partial<Record<"intelligence" | "coding", SyncedAaMetric>>>;
}

export const AA_SNAPSHOT: AaSnapshot = {
  generatedAt: null,
  source: "manual",
  sourceUrl: "https://artificialanalysis.ai/data-api/docs",
  models: {},
};
