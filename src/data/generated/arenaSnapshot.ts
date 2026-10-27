/** 由 `npm run sync:data` 生成；Arena 分数不参与本站主榜排序。 */
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
  "generatedAt": "2026-10-27T21:22:17.770Z",
  "sourceUrl": "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
  "models": {
    "claude-opus-4-8": {
      "text": {
        "value": 1474.2127030951465,
        "rank": null,
        "lower": 1470.3709758231098,
        "upper": 1478.054430367183,
        "observations": 65208,
        "category": "overall",
        "observedAt": "2026-10-22",
        "modelVersion": "Claude Opus 4.8"
      },
      "webdev": {
        "value": 1535.6107663275866,
        "rank": null,
        "lower": 1529.9165089435728,
        "upper": 1541.3050237116,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-23",
        "modelVersion": "Claude Opus 4.8"
      }
    },
    "qwen-3-5": {
      "text": {
        "value": 1441.6936982868262,
        "rank": null,
        "lower": 1438.6290883691815,
        "upper": 1444.7583082044712,
        "observations": 96206,
        "category": "overall",
        "observedAt": "2026-10-22",
        "modelVersion": "Qwen3.5-397B-A17B"
      },
      "webdev": {
        "value": 1400.3097925638554,
        "rank": null,
        "lower": 1395.184754704856,
        "upper": 1405.434830422855,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-23",
        "modelVersion": "Qwen3.5-397B-A17B"
      }
    },
    "claude-sonnet-4-6": {
      "text": {
        "value": 1472.082135371373,
        "rank": null,
        "lower": 1468.5704058298538,
        "upper": 1475.593864912892,
        "observations": 70953,
        "category": "overall",
        "observedAt": "2026-10-22",
        "modelVersion": "Claude Sonnet 4.6"
      },
      "webdev": {
        "value": 1522.6914485676903,
        "rank": null,
        "lower": 1517.5458174595815,
        "upper": 1527.8370796757995,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-23",
        "modelVersion": "Claude Sonnet 4.6"
      }
    },
    "mistral-large-3": {
      "text": {
        "value": 1414.3392932626289,
        "rank": null,
        "lower": 1411.5071573229584,
        "upper": 1417.1714292022994,
        "observations": 86928,
        "category": "overall",
        "observedAt": "2026-10-22",
        "modelVersion": "Mistral Large 3"
      },
      "webdev": {
        "value": 1231.51390620368,
        "rank": null,
        "lower": 1206.0305273341319,
        "upper": 1256.9972850732283,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-23",
        "modelVersion": "Mistral Large 3"
      }
    }
  }
};
