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
  "generatedAt": "2026-09-18T19:41:41.577Z",
  "sourceUrl": "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
  "models": {
    "deepseek-v4-pro": {
      "agent": {
        "value": -0.007147489724484314,
        "rank": null,
        "lower": -0.016467987054543127,
        "upper": 0.0021730076055744988,
        "observations": 1910125,
        "category": "overall",
        "observedAt": "2026-09-15",
        "modelVersion": "DeepSeek V4 Pro"
      }
    },
    "claude-opus-4-8": {
      "text": {
        "value": 1473.2228821497197,
        "rank": null,
        "lower": 1469.0818069706688,
        "upper": 1477.36395732877,
        "observations": 53446,
        "category": "overall",
        "observedAt": "2026-09-13",
        "modelVersion": "claude-opus-4-8"
      },
      "webdev": {
        "value": 1538.8061866281587,
        "rank": null,
        "lower": 1532.356681382837,
        "upper": 1545.2556918734804,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-11",
        "modelVersion": "claude-opus-4-8"
      }
    },
    "qwen-3-5": {
      "text": {
        "value": 1441.8293844884174,
        "rank": null,
        "lower": 1438.5185021552834,
        "upper": 1445.1402668215514,
        "observations": 77007,
        "category": "overall",
        "observedAt": "2026-09-13",
        "modelVersion": "qwen3.5-397b-a17b"
      },
      "webdev": {
        "value": 1398.9222080160453,
        "rank": null,
        "lower": 1393.6634383005353,
        "upper": 1404.1809777315552,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-11",
        "modelVersion": "qwen3.5-397b-a17b"
      }
    },
    "claude-sonnet-4-6": {
      "text": {
        "value": 1472.57427288615,
        "rank": null,
        "lower": 1468.966410769539,
        "upper": 1476.1821350027612,
        "observations": 66208,
        "category": "overall",
        "observedAt": "2026-09-13",
        "modelVersion": "claude-sonnet-4-6"
      },
      "webdev": {
        "value": 1520.9868241527552,
        "rank": null,
        "lower": 1515.7290441878263,
        "upper": 1526.2446041176845,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-11",
        "modelVersion": "claude-sonnet-4-6"
      },
      "agent": {
        "value": -0.01517376664192388,
        "rank": null,
        "lower": -0.026386318014561132,
        "upper": -0.003961215269286628,
        "observations": 1444102,
        "category": "overall",
        "observedAt": "2026-09-15",
        "modelVersion": "Claude Sonnet 4.6"
      }
    },
    "gemini-3-1-pro": {
      "text": {
        "value": 1486.809321925295,
        "rank": null,
        "lower": 1483.6472780293097,
        "upper": 1489.9713658212804,
        "observations": 106951,
        "category": "overall",
        "observedAt": "2026-09-13",
        "modelVersion": "gemini-3.1-pro-preview"
      },
      "webdev": {
        "value": 1446.6380535473631,
        "rank": null,
        "lower": 1441.4780406749705,
        "upper": 1451.798066419756,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-11",
        "modelVersion": "gemini-3.1-pro-preview"
      }
    },
    "minimax-m3": {
      "text": {
        "value": 1441.2503431504656,
        "rank": null,
        "lower": 1437.0385594969212,
        "upper": 1445.46212680401,
        "observations": 48540,
        "category": "overall",
        "observedAt": "2026-09-13",
        "modelVersion": "minimax-m3"
      },
      "webdev": {
        "value": 1486.7017314128002,
        "rank": null,
        "lower": 1480.2544405107374,
        "upper": 1493.1490223148635,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-11",
        "modelVersion": "minimax-m3"
      }
    },
    "claude-fable-5": {
      "text": {
        "value": 1505.6827180827381,
        "rank": null,
        "lower": 1500.9186317406866,
        "upper": 1510.4468044247901,
        "observations": 30057,
        "category": "overall",
        "observedAt": "2026-09-13",
        "modelVersion": "claude-fable-5"
      },
      "webdev": {
        "value": 1627.9838820923837,
        "rank": null,
        "lower": 1620.5261951800203,
        "upper": 1635.4415690047467,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-11",
        "modelVersion": "claude-fable-5"
      }
    },
    "mistral-large-3": {
      "text": {
        "value": 1412.9939500975138,
        "rank": null,
        "lower": 1409.9679520982118,
        "upper": 1416.0199480968154,
        "observations": 69028,
        "category": "overall",
        "observedAt": "2026-09-13",
        "modelVersion": "mistral-large-3"
      },
      "webdev": {
        "value": 1229.5182775536882,
        "rank": null,
        "lower": 1203.5706492752242,
        "upper": 1255.4659058321522,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-11",
        "modelVersion": "mistral-large-3"
      }
    }
  }
};
