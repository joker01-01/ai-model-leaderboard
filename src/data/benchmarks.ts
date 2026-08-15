import type { ObjectiveDimKey } from "../lib/score";
import { AA_SNAPSHOT } from "./generated/aaSnapshot";

export type BenchmarkId =
  | "aa-intelligence"
  | "aa-coding"
  | "gpqa-diamond"
  | "tau2-bench"
  | "swe-bench-pro"
  | "browsecomp";

export interface BenchmarkDefinition {
  id: BenchmarkId;
  dim: ObjectiveDimKey;
  label: string;
  shortLabel: string;
  unit: "%" | "index";
  sourceLabel: string;
  sourceUrl: string;
  sourceTier: "聚合榜";
  calibration: { min: number; max: number };
}

export interface BenchmarkObservation {
  benchmarkId: BenchmarkId;
  value: number;
  modelVersion: string;
  observedAt: string;
}

export interface ObjectiveProfile {
  modelId: string;
  observations: Partial<Record<BenchmarkId, BenchmarkObservation>>;
}

const STANDARD_CALIBRATION = { min: 0, max: 100 };

export const BENCHMARK_DEFINITIONS: BenchmarkDefinition[] = [
  {
    id: "aa-intelligence",
    dim: "intelligence",
    label: "Artificial Analysis Intelligence Index",
    shortLabel: "智能指数",
    unit: "index",
    sourceLabel: "Artificial Analysis（官方 API 快照）",
    sourceUrl: "https://artificialanalysis.ai/data-api/docs",
    sourceTier: "聚合榜",
    calibration: STANDARD_CALIBRATION,
  },
  {
    id: "aa-coding",
    dim: "coding",
    label: "Artificial Analysis Coding Index",
    shortLabel: "编程指数",
    unit: "index",
    sourceLabel: "Artificial Analysis（官方 API 快照）",
    sourceUrl: "https://artificialanalysis.ai/data-api/docs",
    sourceTier: "聚合榜",
    calibration: STANDARD_CALIBRATION,
  },
  {
    id: "gpqa-diamond",
    dim: "reasoning",
    label: "GPQA Diamond",
    shortLabel: "GPQA",
    unit: "%",
    sourceLabel: "Artificial Analysis / GPQA Diamond（公开汇总）",
    sourceUrl: "https://artificialanalysis.ai/",
    sourceTier: "聚合榜",
    calibration: STANDARD_CALIBRATION,
  },
  {
    id: "tau2-bench",
    dim: "agent",
    label: "τ²-Bench Tool Use",
    shortLabel: "工具调用",
    unit: "%",
    sourceLabel: "Artificial Analysis / τ²-Bench（公开汇总）",
    sourceUrl: "https://www.requesty.ai/models/rankings/tool-use",
    sourceTier: "聚合榜",
    calibration: STANDARD_CALIBRATION,
  },
  {
    id: "swe-bench-pro",
    dim: "coding",
    label: "SWE-bench Pro",
    shortLabel: "SWE-Pro",
    unit: "%",
    sourceLabel: "BenchLM（公开汇总）",
    sourceUrl: "https://benchlm.ai/benchmarks/swe-bench-pro",
    sourceTier: "聚合榜",
    calibration: STANDARD_CALIBRATION,
  },
  {
    id: "browsecomp",
    dim: "agent",
    label: "BrowseComp",
    shortLabel: "BrowseComp",
    unit: "%",
    sourceLabel: "BenchLM（公开汇总）",
    sourceUrl: "https://benchlm.ai/benchmarks/browsecomp",
    sourceTier: "聚合榜",
    calibration: STANDARD_CALIBRATION,
  },
];

const observedAt = "2026-08-14";

function observation(
  benchmarkId: BenchmarkId,
  value: number,
  modelVersion: string,
): BenchmarkObservation {
  return { benchmarkId, value, modelVersion, observedAt };
}

/**
 * 静态快照。只收录页面上能对应到同一具体版本的结果；版本不一致时宁可留空。
 * 数值是公开聚合榜的快照，不等同于厂商官方成绩；同一分类允许保留多个信号。
 */
const STATIC_OBJECTIVE_SNAPSHOT: Record<string, ObjectiveProfile> = {
  "deepseek-v4-pro": {
    modelId: "deepseek-v4-pro",
    observations: {
      "aa-intelligence": observation("aa-intelligence", 53.2, "deepseek-v4-pro-0813"),
      "aa-coding": observation("aa-coding", 68.8, "deepseek-v4-pro-0813"),
      "gpqa-diamond": observation("gpqa-diamond", 92.8, "deepseek-v4-pro-0813"),
      "swe-bench-pro": observation("swe-bench-pro", 52.1, "deepseek-v4-pro-0813"),
      "browsecomp": observation("browsecomp", 83.4, "deepseek-v4-pro-0813"),
    },
  },
  "claude-opus-4-8": {
    modelId: "claude-opus-4-8",
    observations: {
      "aa-intelligence": observation("aa-intelligence", 57.3, "claude-opus-4-8"),
      "aa-coding": observation("aa-coding", 74.3, "claude-opus-4-8"),
      "gpqa-diamond": observation("gpqa-diamond", 92.0, "claude-opus-4-8"),
      "tau2-bench": observation("tau2-bench", 94.4, "claude-opus-4-8"),
      "swe-bench-pro": observation("swe-bench-pro", 69.2, "claude-opus-4-8"),
      "browsecomp": observation("browsecomp", 84.3, "claude-opus-4-8"),
    },
  },
  "gpt-56-sol": {
    modelId: "gpt-56-sol",
    observations: {
      "aa-intelligence": observation("aa-intelligence", 60.9, "gpt-5.6-sol"),
      "aa-coding": observation("aa-coding", 77.4, "gpt-5.6-sol"),
      "gpqa-diamond": observation("gpqa-diamond", 94.1, "gpt-5.6-sol"),
      "swe-bench-pro": observation("swe-bench-pro", 64.6, "gpt-5.6-sol"),
      "browsecomp": observation("browsecomp", 92.2, "gpt-5.6-sol"),
    },
  },
  "gpt-56-luna": {
    modelId: "gpt-56-luna",
    observations: {
      "aa-intelligence": observation("aa-intelligence", 52.3, "gpt-5.6-luna"),
      "aa-coding": observation("aa-coding", 71.4, "gpt-5.6-luna"),
      "gpqa-diamond": observation("gpqa-diamond", 91.1, "gpt-5.6-luna"),
      "swe-bench-pro": observation("swe-bench-pro", 62.7, "gpt-5.6-luna"),
      "browsecomp": observation("browsecomp", 83.3, "gpt-5.6-luna"),
    },
  },
  "gemini-3-7-flash": {
    modelId: "gemini-3-7-flash",
    observations: {
      "aa-intelligence": observation("aa-intelligence", 56.0, "gemini-3.7-flash@eu"),
      "aa-coding": observation("aa-coding", 76.1, "gemini-3.7-flash@eu"),
      "gpqa-diamond": observation("gpqa-diamond", 94.5, "gemini-3.7-flash@eu"),
    },
  },
  "qwen-3-5": {
    modelId: "qwen-3-5",
    observations: {
      "aa-intelligence": observation("aa-intelligence", 34.3, "qwen/qwen3.5-397b-a17b"),
      "aa-coding": observation("aa-coding", 48.2, "qwen/qwen3.5-397b-a17b"),
      "gpqa-diamond": observation("gpqa-diamond", 89.3, "qwen/qwen3.5-397b-a17b"),
      "tau2-bench": observation("tau2-bench", 95.6, "qwen/qwen3.5-397b-a17b"),
    },
  },
  "claude-sonnet-4-6": {
    modelId: "claude-sonnet-4-6",
    observations: {
      "aa-intelligence": observation("aa-intelligence", 48.4, "claude-sonnet-4-6"),
      "aa-coding": observation("aa-coding", 63.0, "claude-sonnet-4-6"),
      "gpqa-diamond": observation("gpqa-diamond", 91.1, "claude-sonnet-4-6"),
    },
  },
  "grok-4-6": {
    modelId: "grok-4-6",
    observations: {
      "aa-intelligence": observation("aa-intelligence", 60.9, "grok-4.6"),
      "aa-coding": observation("aa-coding", 76.8, "grok-4.6"),
      "gpqa-diamond": observation("gpqa-diamond", 94.9, "grok-4.6"),
    },
  },
  "kimi-k3": {
    modelId: "kimi-k3",
    observations: {
      "aa-intelligence": observation("aa-intelligence", 59.7, "kimi-k3"),
      "aa-coding": observation("aa-coding", 76.2, "kimi-k3"),
      "gpqa-diamond": observation("gpqa-diamond", 93.5, "kimi-k3"),
      "browsecomp": observation("browsecomp", 91.2, "kimi-k3"),
    },
  },
  "gemini-3-1-pro": {
    modelId: "gemini-3-1-pro",
    observations: {
      "aa-intelligence": observation("aa-intelligence", 47.7, "gemini-3.1-pro-preview"),
      "aa-coding": observation("aa-coding", 68.8, "gemini-3.1-pro-preview"),
      "gpqa-diamond": observation("gpqa-diamond", 94.1, "gemini-3.1-pro-preview"),
      "tau2-bench": observation("tau2-bench", 95.6, "gemini-3.1-pro-preview"),
    },
  },
  "minimax-m3": {
    modelId: "minimax-m3",
    observations: {
      "aa-intelligence": observation("aa-intelligence", 45.4, "minimax-m3"),
      "aa-coding": observation("aa-coding", 58.6, "minimax-m3"),
      "gpqa-diamond": observation("gpqa-diamond", 92.9, "minimax-m3"),
      "swe-bench-pro": observation("swe-bench-pro", 59.0, "minimax-m3"),
      "browsecomp": observation("browsecomp", 83.5, "minimax-m3"),
    },
  },
  "deepseek-v4-flash": {
    modelId: "deepseek-v4-flash",
    observations: {
      "aa-intelligence": observation("aa-intelligence", 51.8, "deepseek-v4-flash-0731"),
      "aa-coding": observation("aa-coding", 69.1, "deepseek-v4-flash-0731"),
      "gpqa-diamond": observation("gpqa-diamond", 90.8, "deepseek-v4-flash-0731"),
      "swe-bench-pro": observation("swe-bench-pro", 52.6, "deepseek-v4-flash-0731"),
      "browsecomp": observation("browsecomp", 73.2, "deepseek-v4-flash-0731"),
    },
  },
  "claude-fable-5": {
    modelId: "claude-fable-5",
    observations: {
      "aa-intelligence": observation("aa-intelligence", 62.1, "claude-fable-5"),
      "aa-coding": observation("aa-coding", 76.5, "claude-fable-5"),
      "gpqa-diamond": observation("gpqa-diamond", 92.6, "claude-fable-5"),
      "tau2-bench": observation("tau2-bench", 98.5, "claude-fable-5"),
      "swe-bench-pro": observation("swe-bench-pro", 80.0, "claude-fable-5"),
    },
  },
};

/** 自动同步覆盖 AA 的主指数与编程指数；其余明细仍保留已核验的静态快照。 */
const OBJECTIVE_MODEL_IDS = new Set([
  ...Object.keys(STATIC_OBJECTIVE_SNAPSHOT),
  ...Object.keys(AA_SNAPSHOT.models),
]);

export const OBJECTIVE_SNAPSHOT: Record<string, ObjectiveProfile> = Object.fromEntries(
  [...OBJECTIVE_MODEL_IDS].map((modelId) => {
    const profile = STATIC_OBJECTIVE_SNAPSHOT[modelId] ?? { modelId, observations: {} };
    const synced = AA_SNAPSHOT.models[modelId];
    if (!synced) return [modelId, profile];
    const observations = { ...profile.observations };
    if (synced.intelligence) {
      observations["aa-intelligence"] = {
        benchmarkId: "aa-intelligence",
        value: synced.intelligence.value,
        modelVersion: synced.intelligence.modelVersion,
        observedAt: synced.intelligence.observedAt,
      };
    }
    if (synced.coding) {
      observations["aa-coding"] = {
        benchmarkId: "aa-coding",
        value: synced.coding.value,
        modelVersion: synced.coding.modelVersion,
        observedAt: synced.coding.observedAt,
      };
    }
    return [modelId, { ...profile, observations }];
  }),
);

export const BENCHMARK_DATE = AA_SNAPSHOT.generatedAt?.slice(0, 10) ?? observedAt;

/** 固定校准入口：不读取当前榜单的最小值、最大值或百分位。 */
export function calibrateBenchmarkValue(definition: BenchmarkDefinition, value: number): number {
  const span = definition.calibration.max - definition.calibration.min;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(100, ((value - definition.calibration.min) / span) * 100));
}
