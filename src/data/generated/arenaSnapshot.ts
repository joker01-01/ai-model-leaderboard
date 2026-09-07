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
  "generatedAt": "2026-09-06T19:15:22.563Z",
  "sourceUrl": "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
  "models": {
    "deepseek-v4-pro": {
      "agent": {
        "value": 0.0057508007722761115,
        "rank": null,
        "lower": -0.005094973341455493,
        "upper": 0.016596574886007714,
        "observations": 1570167,
        "category": "overall",
        "observedAt": "2026-09-05",
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
        "value": 1540.134716201152,
        "rank": null,
        "lower": 1533.4491462431097,
        "upper": 1546.820286159194,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-05",
        "modelVersion": "claude-opus-4-8"
      },
      "agent": {
        "value": 0.018481196815080807,
        "rank": null,
        "lower": -0.009629596004809896,
        "upper": 0.046591989634971506,
        "observations": 1438529,
        "category": "overall",
        "observedAt": "2026-09-05",
        "modelVersion": "Claude Opus 4.8"
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
        "value": 1398.55126177761,
        "rank": null,
        "lower": 1393.2616103897167,
        "upper": 1403.8409131655035,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-05",
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
        "value": 1521.4895156151356,
        "rank": null,
        "lower": 1516.1927675906704,
        "upper": 1526.7862636396003,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-05",
        "modelVersion": "claude-sonnet-4-6"
      },
      "agent": {
        "value": 0.004965836629023421,
        "rank": null,
        "lower": -0.0078610501572942,
        "upper": 0.017792723415341043,
        "observations": 1445308,
        "category": "overall",
        "observedAt": "2026-09-05",
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
        "value": 1445.521203913088,
        "rank": null,
        "lower": 1440.3291720667844,
        "upper": 1450.7132357593919,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-05",
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
        "value": 1487.300425499026,
        "rank": null,
        "lower": 1480.631500019464,
        "upper": 1493.969350978588,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-05",
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
        "value": 1629.0458934793564,
        "rank": null,
        "lower": 1621.2206695752652,
        "upper": 1636.8711173834477,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-05",
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
        "value": 1229.2302833091712,
        "rank": null,
        "lower": 1203.283856157013,
        "upper": 1255.176710461329,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-05",
        "modelVersion": "mistral-large-3"
      }
    }
  }
};
