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
  "generatedAt": "2026-09-11T10:58:01.073Z",
  "sourceUrl": "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
  "models": {
    "deepseek-v4-pro": {
      "agent": {
        "value": -0.004243429492245743,
        "rank": null,
        "lower": -0.01564838070595315,
        "upper": 0.007161521721461664,
        "observations": 1638264,
        "category": "overall",
        "observedAt": "2026-09-08",
        "modelVersion": "DeepSeek V4 Pro"
      }
    },
    "claude-opus-4-8": {
      "text": {
        "value": 1472.8520033039752,
        "rank": null,
        "lower": 1468.567434702214,
        "upper": 1477.1365719057362,
        "observations": 49404,
        "category": "overall",
        "observedAt": "2026-09-02",
        "modelVersion": "claude-opus-4-8"
      },
      "webdev": {
        "value": 1539.7220867088777,
        "rank": null,
        "lower": 1533.1232080865723,
        "upper": 1546.3209653311828,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-08",
        "modelVersion": "claude-opus-4-8"
      }
    },
    "qwen-3-5": {
      "text": {
        "value": 1441.1051585312441,
        "rank": null,
        "lower": 1437.7307491335641,
        "upper": 1444.4795679289243,
        "observations": 73640,
        "category": "overall",
        "observedAt": "2026-09-02",
        "modelVersion": "qwen3.5-397b-a17b"
      },
      "webdev": {
        "value": 1398.8562338683407,
        "rank": null,
        "lower": 1393.595949509646,
        "upper": 1404.1165182270356,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-08",
        "modelVersion": "qwen3.5-397b-a17b"
      }
    },
    "claude-sonnet-4-6": {
      "text": {
        "value": 1472.3891139817872,
        "rank": null,
        "lower": 1468.7757148615722,
        "upper": 1476.0025131020022,
        "observations": 66316,
        "category": "overall",
        "observedAt": "2026-09-02",
        "modelVersion": "claude-sonnet-4-6"
      },
      "webdev": {
        "value": 1521.0491590062888,
        "rank": null,
        "lower": 1515.789683922701,
        "upper": 1526.308634089877,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-08",
        "modelVersion": "claude-sonnet-4-6"
      },
      "agent": {
        "value": -0.010492040299401342,
        "rank": null,
        "lower": -0.023599040110840803,
        "upper": 0.0026149595120381203,
        "observations": 1444598,
        "category": "overall",
        "observedAt": "2026-09-08",
        "modelVersion": "Claude Sonnet 4.6"
      }
    },
    "gemini-3-1-pro": {
      "text": {
        "value": 1486.7298381462967,
        "rank": null,
        "lower": 1483.516965794996,
        "upper": 1489.9427104975975,
        "observations": 102999,
        "category": "overall",
        "observedAt": "2026-09-02",
        "modelVersion": "gemini-3.1-pro-preview"
      },
      "webdev": {
        "value": 1446.4886756546064,
        "rank": null,
        "lower": 1441.3269376483117,
        "upper": 1451.6504136609012,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-08",
        "modelVersion": "gemini-3.1-pro-preview"
      }
    },
    "minimax-m3": {
      "text": {
        "value": 1442.9482267954468,
        "rank": null,
        "lower": 1438.5995446696998,
        "upper": 1447.2969089211938,
        "observations": 44829,
        "category": "overall",
        "observedAt": "2026-09-02",
        "modelVersion": "minimax-m3"
      },
      "webdev": {
        "value": 1486.2607982066777,
        "rank": null,
        "lower": 1479.6718105576838,
        "upper": 1492.8497858556716,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-08",
        "modelVersion": "minimax-m3"
      }
    },
    "claude-fable-5": {
      "text": {
        "value": 1507.164171675996,
        "rank": null,
        "lower": 1502.1991266186806,
        "upper": 1512.129216733311,
        "observations": 27189,
        "category": "overall",
        "observedAt": "2026-09-02",
        "modelVersion": "claude-fable-5"
      },
      "webdev": {
        "value": 1628.2738774974382,
        "rank": null,
        "lower": 1620.570349028876,
        "upper": 1635.9774059660003,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-08",
        "modelVersion": "claude-fable-5"
      }
    },
    "mistral-large-3": {
      "text": {
        "value": 1413.6667924340622,
        "rank": null,
        "lower": 1410.5889308514274,
        "upper": 1416.7446540166968,
        "observations": 65587,
        "category": "overall",
        "observedAt": "2026-09-02",
        "modelVersion": "mistral-large-3"
      },
      "webdev": {
        "value": 1229.558958324096,
        "rank": null,
        "lower": 1203.6131181281914,
        "upper": 1255.5047985200006,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-08",
        "modelVersion": "mistral-large-3"
      }
    }
  }
};
