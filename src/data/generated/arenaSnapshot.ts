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
  "generatedAt": "2026-08-21T17:48:55.383Z",
  "sourceUrl": "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
  "models": {
    "deepseek-v4-pro": {
      "agent": {
        "value": 0.0005331527917037853,
        "rank": null,
        "lower": -0.008239440596025192,
        "upper": 0.009305746179432764,
        "observations": 1429855,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "DeepSeek V4 Pro"
      }
    },
    "claude-opus-4-8": {
      "text": {
        "value": 1473.0454355394568,
        "rank": null,
        "lower": 1468.5537932658174,
        "upper": 1477.5370778130964,
        "observations": 44286,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "claude-opus-4-8"
      },
      "webdev": {
        "value": 1539.24613104641,
        "rank": null,
        "lower": 1532.1968589224948,
        "upper": 1546.2954031703252,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "claude-opus-4-8"
      },
      "agent": {
        "value": 0.0250693146420208,
        "rank": null,
        "lower": 0.0025504265077955016,
        "upper": 0.0475882027762461,
        "observations": 1404239,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "Claude Opus 4.8"
      }
    },
    "qwen-3-5": {
      "text": {
        "value": 1441.9734923232613,
        "rank": null,
        "lower": 1438.5152612824845,
        "upper": 1445.4317233640381,
        "observations": 69341,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "qwen3.5-397b-a17b"
      },
      "webdev": {
        "value": 1399.4771757428068,
        "rank": null,
        "lower": 1394.05806418314,
        "upper": 1404.8962873024736,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "qwen3.5-397b-a17b"
      }
    },
    "claude-sonnet-4-6": {
      "text": {
        "value": 1472.0871269536524,
        "rank": null,
        "lower": 1468.471794913004,
        "upper": 1475.7024589943005,
        "observations": 66542,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "claude-sonnet-4-6"
      },
      "webdev": {
        "value": 1522.8084258237106,
        "rank": null,
        "lower": 1517.369717705628,
        "upper": 1528.247133941793,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "claude-sonnet-4-6"
      },
      "agent": {
        "value": 0.0288168874374108,
        "rank": null,
        "lower": 0.0169364999740041,
        "upper": 0.0406972749008175,
        "observations": 1260144,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "Claude Sonnet 4.6"
      }
    },
    "gemini-3-1-pro": {
      "text": {
        "value": 1486.1847454113572,
        "rank": null,
        "lower": 1482.8881173147001,
        "upper": 1489.4813735080145,
        "observations": 98068,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "gemini-3.1-pro-preview"
      },
      "webdev": {
        "value": 1446.5223456414137,
        "rank": null,
        "lower": 1441.213523417961,
        "upper": 1451.8311678648665,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "gemini-3.1-pro-preview"
      }
    },
    "minimax-m3": {
      "text": {
        "value": 1442.2581833481318,
        "rank": null,
        "lower": 1437.7131287040906,
        "upper": 1446.8032379921726,
        "observations": 39985,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "minimax-m3"
      },
      "webdev": {
        "value": 1488.542462189841,
        "rank": null,
        "lower": 1481.5223899088571,
        "upper": 1495.5625344708249,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "minimax-m3"
      }
    },
    "claude-fable-5": {
      "text": {
        "value": 1507.3327828803424,
        "rank": null,
        "lower": 1502.090703790006,
        "upper": 1512.5748619706787,
        "observations": 23626,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "claude-fable-5"
      },
      "webdev": {
        "value": 1625.9284030567367,
        "rank": null,
        "lower": 1617.6458193826152,
        "upper": 1634.2109867308582,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "claude-fable-5"
      }
    },
    "mistral-large-3": {
      "text": {
        "value": 1414.0467273381862,
        "rank": null,
        "lower": 1410.9088252556066,
        "upper": 1417.1846294207658,
        "observations": 61772,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "mistral-large-3"
      },
      "webdev": {
        "value": 1230.0362202233312,
        "rank": null,
        "lower": 1204.2152803837726,
        "upper": 1255.8571600628898,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-08-19",
        "modelVersion": "mistral-large-3"
      }
    }
  }
};
