import type { DimKey } from "../data/models";

export const DIM_KEYS: DimKey[] = ["intelligence", "coding", "agent", "reasoning", "value", "openness"];

export const DIM_LABELS: Record<DimKey, string> = {
  intelligence: "综合智能",
  coding: "编程",
  agent: "Agent",
  reasoning: "推理·数学",
  value: "性价比",
  openness: "开源",
};

export type ObjectiveDimKey = "intelligence" | "coding" | "reasoning" | "agent";

export const OBJECTIVE_DIM_KEYS: ObjectiveDimKey[] = ["intelligence", "coding", "reasoning", "agent"];

export const OBJECTIVE_DIM_LABELS: Record<ObjectiveDimKey, string> = {
  intelligence: "综合智能",
  coding: "编程",
  reasoning: "推理·数学",
  agent: "Agent",
};

export type Weights = Record<DimKey, number>;

// 编辑部默认口径：智能为主、兼顾性价比
export const DEFAULT_WEIGHTS: Weights = { intelligence: 31, coding: 21, agent: 15, reasoning: 16, value: 14, openness: 3 };

export interface Preset { name: string; note: string; weights: Weights }

export const PRESETS: Preset[] = [
  { name: "综合（含性价比）", note: "编辑部默认", weights: DEFAULT_WEIGHTS },
  { name: "纯智力", note: "不看价格，只看智能表现", weights: { intelligence: 40, coding: 25, agent: 15, reasoning: 20, value: 0, openness: 0 } },
  { name: "编程优先", note: "开发者视角", weights: { intelligence: 20, coding: 40, agent: 15, reasoning: 15, value: 5, openness: 5 } },
  { name: "性价比优先", note: "每一分钱买到多少智能", weights: { intelligence: 25, coding: 15, agent: 5, reasoning: 5, value: 45, openness: 5 } },
  { name: "开源友好", note: "可自部署权重加分", weights: { intelligence: 20, coding: 10, agent: 5, reasoning: 5, value: 20, openness: 40 } },
];

export const OBJECTIVE_WEIGHTS: Record<ObjectiveDimKey, number> = {
  intelligence: 0.3,
  coding: 0.25,
  reasoning: 0.25,
  agent: 0.2,
};

/** 综合分 = Σ 维度分 × 权重 ÷ 权重总和（按权重总和归一化，自定义口径下同样成立） */
export function composite(dims: Record<DimKey, number>, w: Weights): number {
  const total = weightsSum(w);
  if (total === 0) return 0;
  return DIM_KEYS.reduce((sum, k) => sum + dims[k] * w[k], 0) / total;
}

export function weightsSum(w: Weights): number {
  return DIM_KEYS.reduce((s, k) => s + w[k], 0);
}

export interface ObjectiveScore {
  score: number | null;
  coverage: number;
  available: number;
  total: number;
  confidence: "高" | "中" | "低" | "暂无";
}

/**
 * 客观榜对已观测维度按固定权重重归一化；不足两个维度时不参与排名。
 * 观测值已经是 0–100 的公开指数/百分比，保留固定校准入口，后续可替换单项标尺。
 */
export function objectiveScore(
  dims: Partial<Record<ObjectiveDimKey, number>>,
  weights: Record<ObjectiveDimKey, number> = OBJECTIVE_WEIGHTS,
): ObjectiveScore {
  const availableKeys = OBJECTIVE_DIM_KEYS.filter((k) => typeof dims[k] === "number" && Number.isFinite(dims[k]));
  const available = availableKeys.length;
  const total = OBJECTIVE_DIM_KEYS.length;
  const coverage = available / total;
  const confidence: ObjectiveScore["confidence"] = available === 0 ? "暂无" : coverage >= 0.75 ? "高" : coverage >= 0.5 ? "中" : "低";
  if (available < 2) return { score: null, coverage, available, total, confidence };
  const weightTotal = availableKeys.reduce((sum, k) => sum + weights[k], 0);
  const score = availableKeys.reduce((sum, k) => sum + (dims[k] ?? 0) * weights[k], 0) / weightTotal;
  return { score, coverage, available, total, confidence };
}
