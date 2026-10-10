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
  "generatedAt": "2026-10-10T20:35:07.193Z",
  "sourceUrl": "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
  "models": {
    "claude-opus-4-8": {
      "text": {
        "value": 1474.2572446151962,
        "rank": null,
        "lower": 1470.410204210637,
        "upper": 1478.1042850197555,
        "observations": 65259,
        "category": "overall",
        "observedAt": "2026-10-08",
        "modelVersion": "claude-opus-4-8"
      },
      "webdev": {
        "value": 1535.7658454963746,
        "rank": null,
        "lower": 1530.0601177701467,
        "upper": 1541.4715732226025,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-08",
        "modelVersion": "claude-opus-4-8"
      }
    },
    "qwen-3-5": {
      "text": {
        "value": 1441.7467845999608,
        "rank": null,
        "lower": 1438.6295185099316,
        "upper": 1444.8640506899897,
        "observations": 91190,
        "category": "overall",
        "observedAt": "2026-10-08",
        "modelVersion": "qwen3.5-397b-a17b"
      },
      "webdev": {
        "value": 1399.9029765115806,
        "rank": null,
        "lower": 1394.7856052840941,
        "upper": 1405.0203477390671,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-08",
        "modelVersion": "qwen3.5-397b-a17b"
      }
    },
    "claude-sonnet-4-6": {
      "text": {
        "value": 1471.9895652779596,
        "rank": null,
        "lower": 1468.4755077749332,
        "upper": 1475.503622780986,
        "observations": 70971,
        "category": "overall",
        "observedAt": "2026-10-08",
        "modelVersion": "claude-sonnet-4-6"
      },
      "webdev": {
        "value": 1522.4024695572866,
        "rank": null,
        "lower": 1517.257210546973,
        "upper": 1527.5477285676,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-08",
        "modelVersion": "claude-sonnet-4-6"
      }
    },
    "gemini-3-1-pro": {
      "text": {
        "value": 1487.3024091972857,
        "rank": null,
        "lower": 1484.3175903387964,
        "upper": 1490.287228055775,
        "observations": 124675,
        "category": "overall",
        "observedAt": "2026-10-08",
        "modelVersion": "gemini-3.1-pro-preview"
      },
      "webdev": {
        "value": 1446.7086676853123,
        "rank": null,
        "lower": 1441.6559017792729,
        "upper": 1451.7614335913515,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-08",
        "modelVersion": "gemini-3.1-pro-preview"
      }
    },
    "minimax-m3": {
      "text": {
        "value": 1440.4601846954656,
        "rank": null,
        "lower": 1436.5679099049798,
        "upper": 1444.3524594859514,
        "observations": 61220,
        "category": "overall",
        "observedAt": "2026-10-08",
        "modelVersion": "minimax-m3"
      },
      "webdev": {
        "value": 1481.6981364670619,
        "rank": null,
        "lower": 1476.0522019254827,
        "upper": 1487.3440710086413,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-08",
        "modelVersion": "minimax-m3"
      }
    },
    "mistral-large-3": {
      "text": {
        "value": 1413.7716548344843,
        "rank": null,
        "lower": 1410.8916042133892,
        "upper": 1416.6517054555793,
        "observations": 81759,
        "category": "overall",
        "observedAt": "2026-10-08",
        "modelVersion": "mistral-large-3"
      },
      "webdev": {
        "value": 1230.3680191474898,
        "rank": null,
        "lower": 1204.900389594494,
        "upper": 1255.8356487004853,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-08",
        "modelVersion": "mistral-large-3"
      }
    }
  }
};
