import type { DimKey } from "../data/models";

export const DIM_KEYS: DimKey[] = ["intelligence", "coding", "agent", "reasoning", "value", "openness"];

export const DIM_LABELS: Record<DimKey, string> = {
  intelligence: "综合智能",
  coding: "编程",
  agent: "工具使用",
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
  agent: "工具使用",
};

export type Weights = Record<DimKey, number>;

/** 编辑推荐候选线：偏好前五 + 最新同版本公开智能指数前三。 */
export const EDITORIAL_CANDIDATE_COUNT = 5;
export const OBJECTIVE_CANDIDATE_COUNT = 3;

// 编辑部默认口径：智能为主、兼顾性价比
export const DEFAULT_WEIGHTS: Weights = { intelligence: 31, coding: 21, agent: 15, reasoning: 16, value: 14, openness: 3 };

export interface Preset { name: string; note: string; weights: Weights }

export const PRESETS: Preset[] = [
  { name: "综合（含性价比）", note: "默认设置", weights: DEFAULT_WEIGHTS },
  { name: "只看智能", note: "不看价格，只看智能表现", weights: { intelligence: 40, coding: 25, agent: 15, reasoning: 20, value: 0, openness: 0 } },
  { name: "编程优先", note: "开发者视角", weights: { intelligence: 20, coding: 40, agent: 15, reasoning: 15, value: 5, openness: 5 } },
  { name: "性价比优先", note: "每一分钱买到多少智能", weights: { intelligence: 25, coding: 15, agent: 5, reasoning: 5, value: 45, openness: 5 } },
  { name: "开源友好", note: "可自部署权重加分", weights: { intelligence: 20, coding: 10, agent: 5, reasoning: 5, value: 20, openness: 40 } },
];

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
 * 公开评测主榜只按同版本 Artificial Analysis Intelligence Index 排名。
 * 其余公开指标用于解释模型表现，但不与主指数混算，避免不同指标和重叠评测重复加权。
 */
export function objectiveScore(
  dims: Partial<Record<ObjectiveDimKey, number>>,
): ObjectiveScore {
  const availableKeys = OBJECTIVE_DIM_KEYS.filter((k) => typeof dims[k] === "number" && Number.isFinite(dims[k]));
  const available = availableKeys.length;
  const total = OBJECTIVE_DIM_KEYS.length;
  const coverage = available / total;
  const confidence: ObjectiveScore["confidence"] = available === 0 ? "暂无" : coverage >= 0.75 ? "高" : coverage >= 0.5 ? "中" : "低";
  const score = dims.intelligence;
  if (typeof score !== "number" || !Number.isFinite(score)) return { score: null, coverage, available, total, confidence };
  return { score, coverage, available, total, confidence };
}
