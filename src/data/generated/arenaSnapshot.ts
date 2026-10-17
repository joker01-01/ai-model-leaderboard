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
  "generatedAt": "2026-10-17T19:27:47.429Z",
  "sourceUrl": "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
  "models": {
    "claude-opus-4-8": {
      "text": {
        "value": 1474.3188347223909,
        "rank": null,
        "lower": 1470.4723897525055,
        "upper": 1478.1652796922765,
        "observations": 65172,
        "category": "overall",
        "observedAt": "2026-10-15",
        "modelVersion": "claude-opus-4-8"
      },
      "webdev": {
        "value": 1535.9091070638751,
        "rank": null,
        "lower": 1530.209028183151,
        "upper": 1541.6091859445992,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-16",
        "modelVersion": "Claude Opus 4.8"
      }
    },
    "qwen-3-5": {
      "text": {
        "value": 1441.5655970064536,
        "rank": null,
        "lower": 1438.475745273247,
        "upper": 1444.6554487396604,
        "observations": 93567,
        "category": "overall",
        "observedAt": "2026-10-15",
        "modelVersion": "qwen3.5-397b-a17b"
      },
      "webdev": {
        "value": 1400.4867817048178,
        "rank": null,
        "lower": 1395.3567736472528,
        "upper": 1405.6167897623827,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-16",
        "modelVersion": "Qwen3.5-397B-A17B"
      }
    },
    "claude-sonnet-4-6": {
      "text": {
        "value": 1472.102664549635,
        "rank": null,
        "lower": 1468.5893014469252,
        "upper": 1475.6160276523447,
        "observations": 70931,
        "category": "overall",
        "observedAt": "2026-10-15",
        "modelVersion": "claude-sonnet-4-6"
      },
      "webdev": {
        "value": 1522.6867178167672,
        "rank": null,
        "lower": 1517.5354755294243,
        "upper": 1527.8379601041102,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-16",
        "modelVersion": "Claude Sonnet 4.6"
      }
    },
    "minimax-m3": {
      "text": {
        "value": 1441.3155955735351,
        "rank": null,
        "lower": 1437.475817974704,
        "upper": 1445.1553731723666,
        "observations": 63973,
        "category": "overall",
        "observedAt": "2026-10-15",
        "modelVersion": "minimax-m3"
      }
    },
    "mistral-large-3": {
      "text": {
        "value": 1414.2471003865203,
        "rank": null,
        "lower": 1411.3861729230061,
        "upper": 1417.1080278500342,
        "observations": 84205,
        "category": "overall",
        "observedAt": "2026-10-15",
        "modelVersion": "mistral-large-3"
      },
      "webdev": {
        "value": 1230.4642215084482,
        "rank": null,
        "lower": 1204.973185925734,
        "upper": 1255.955257091162,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-16",
        "modelVersion": "Mistral Large 3"
      }
    }
  }
};
