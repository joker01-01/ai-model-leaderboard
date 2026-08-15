/**
 * 由 `npm run sync:data` 生成。Arena 分数只用于详情中的用户偏好参考，不参与本站主榜排序。
 */
export interface ArenaMetric {
  value: number;
  rank: number | null;
  lower: number | null;
  upper: number | null;
  observations: number | null;
  category: string;
  observedAt: string;
  modelVersion: string;
}

export interface ArenaSnapshot {
  generatedAt: string | null;
  sourceUrl: string;
  models: Record<string, Partial<Record<"text" | "webdev" | "agent", ArenaMetric>>>;
}

export const ARENA_SNAPSHOT: ArenaSnapshot = {
  generatedAt: null,
  sourceUrl: "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
  models: {},
};
