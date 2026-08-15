import type { DimKey, Model } from "../data/models";
import {
  BENCHMARK_DEFINITIONS,
  calibrateBenchmarkValue,
  type BenchmarkId,
  type BenchmarkObservation,
  type ObjectiveProfile,
} from "../data/benchmarks";

export interface EditorialEvidence {
  label: string;
  basis: "公开数据" | "规则";
  count: number;
  observedAt: string | null;
}

export interface EditorialProfile {
  dims: Partial<Record<DimKey, number>>;
  evidence: Partial<Record<DimKey, EditorialEvidence>>;
  coverage: number;
}

const PRICE_TIER_SCORES: Record<Model["priceTier"], number> = {
  "极高": 20,
  "高": 40,
  "中": 60,
  "低": 80,
  "自部署": 95,
};

const CORE_BENCHMARKS: Record<Extract<DimKey, "intelligence" | "coding" | "reasoning" | "agent">, BenchmarkId[]> = {
  intelligence: ["aa-intelligence"],
  coding: ["aa-coding"],
  reasoning: ["gpqa-diamond"],
  agent: ["tau2-bench", "browsecomp"],
};

function definitionFor(id: BenchmarkId) {
  return BENCHMARK_DEFINITIONS.find((definition) => definition.id === id);
}

function normalizedObservation(id: BenchmarkId, observation: BenchmarkObservation): number {
  const definition = definitionFor(id);
  return definition ? calibrateBenchmarkValue(definition, observation.value) : observation.value;
}

function evidenceFor(
  observations: Partial<Record<BenchmarkId, BenchmarkObservation>>,
  ids: BenchmarkId[],
): { value: number; evidence: EditorialEvidence } | null {
  const available = ids.flatMap((id) => {
    const observation = observations[id];
    return observation ? [{ id, observation }] : [];
  });
  if (available.length === 0) return null;
  const values = available.map(({ id, observation }) => normalizedObservation(id, observation));
  const dates = available.map(({ observation }) => observation.observedAt).sort();
  return {
    value: values.reduce((sum, value) => sum + value, 0) / values.length,
    evidence: {
      label: ids.length > 1 ? "公开分类均值" : "同版本公开数据",
      basis: "公开数据",
      count: available.length,
      observedAt: dates[dates.length - 1] ?? null,
    },
  };
}

function opennessScore(model: Model): number {
  // 开放程度是二值事实：开放权重为 100，未开放权重为 0。
  // 许可证类型不再在这个维度里做半连续加减，具体许可证仍在模型详情展示。
  return model.open ? 100 : 0;
}

/**
 * 编辑榜基础分：四项能力来自同版本公开数据，价格与开放程度来自固定规则。
 * 没有 AA 智能指数时不生成完整编辑分，避免仅凭资料描述硬排模型。
 */
export function buildEditorialProfile(model: Model, profile?: ObjectiveProfile): EditorialProfile {
  const observations = profile?.observations ?? {};
  const dims: Partial<Record<DimKey, number>> = {};
  const evidence: Partial<Record<DimKey, EditorialEvidence>> = {};

  (Object.entries(CORE_BENCHMARKS) as Array<[Extract<DimKey, "intelligence" | "coding" | "reasoning" | "agent">, BenchmarkId[]]>).forEach(([dim, ids]) => {
    const result = evidenceFor(observations, ids);
    if (!result) return;
    dims[dim] = result.value;
    evidence[dim] = result.evidence;
  });

  dims.value = PRICE_TIER_SCORES[model.priceTier];
  evidence.value = { label: "价格档位规则", basis: "规则", count: 1, observedAt: null };
  dims.openness = opennessScore(model);
  evidence.openness = { label: "开放程度规则", basis: "规则", count: 1, observedAt: null };

  return { dims, evidence, coverage: Object.keys(dims).length / 6 };
}
