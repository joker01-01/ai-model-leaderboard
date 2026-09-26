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
  "generatedAt": "2026-09-26T19:54:43.712Z",
  "sourceUrl": "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
  "models": {
    "deepseek-v4-pro": {
      "agent": {
        "value": -0.010960613060963575,
        "rank": null,
        "lower": -0.020628108308339638,
        "upper": -0.0012931178135875132,
        "observations": 1934968,
        "category": "overall",
        "observedAt": "2026-09-25",
        "modelVersion": "DeepSeek V4 Pro"
      }
    },
    "claude-opus-4-8": {
      "text": {
        "value": 1473.7466202903918,
        "rank": null,
        "lower": 1469.8441446163833,
        "upper": 1477.6490959644,
        "observations": 62717,
        "category": "overall",
        "observedAt": "2026-09-25",
        "modelVersion": "claude-opus-4-8"
      },
      "webdev": {
        "value": 1534.9821819734377,
        "rank": null,
        "lower": 1529.1828004164647,
        "upper": 1540.7815635304107,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-25",
        "modelVersion": "claude-opus-4-8"
      }
    },
    "qwen-3-5": {
      "text": {
        "value": 1441.7606572784205,
        "rank": null,
        "lower": 1438.5800787805401,
        "upper": 1444.9412357763008,
        "observations": 86319,
        "category": "overall",
        "observedAt": "2026-09-25",
        "modelVersion": "qwen3.5-397b-a17b"
      },
      "webdev": {
        "value": 1399.7262205690188,
        "rank": null,
        "lower": 1394.615257881036,
        "upper": 1404.8371832570012,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-25",
        "modelVersion": "qwen3.5-397b-a17b"
      }
    },
    "claude-sonnet-4-6": {
      "text": {
        "value": 1472.21847327298,
        "rank": null,
        "lower": 1468.6952466822504,
        "upper": 1475.7416998637095,
        "observations": 70662,
        "category": "overall",
        "observedAt": "2026-09-25",
        "modelVersion": "claude-sonnet-4-6"
      },
      "webdev": {
        "value": 1521.255228715998,
        "rank": null,
        "lower": 1516.119355617801,
        "upper": 1526.3911018141955,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-25",
        "modelVersion": "claude-sonnet-4-6"
      }
    },
    "gemini-3-1-pro": {
      "text": {
        "value": 1486.6776290065297,
        "rank": null,
        "lower": 1483.643347332462,
        "upper": 1489.7119106805974,
        "observations": 119196,
        "category": "overall",
        "observedAt": "2026-09-25",
        "modelVersion": "gemini-3.1-pro-preview"
      },
      "webdev": {
        "value": 1446.3145134914955,
        "rank": null,
        "lower": 1441.2695812645422,
        "upper": 1451.3594457184488,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-25",
        "modelVersion": "gemini-3.1-pro-preview"
      }
    },
    "minimax-m3": {
      "text": {
        "value": 1440.4553191574714,
        "rank": null,
        "lower": 1436.4570799971345,
        "upper": 1444.453558317808,
        "observations": 56646,
        "category": "overall",
        "observedAt": "2026-09-25",
        "modelVersion": "minimax-m3"
      },
      "webdev": {
        "value": 1483.4066915845285,
        "rank": null,
        "lower": 1477.5657365611291,
        "upper": 1489.247646607928,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-25",
        "modelVersion": "minimax-m3"
      }
    },
    "mistral-large-3": {
      "text": {
        "value": 1413.2541898108755,
        "rank": null,
        "lower": 1410.341946753164,
        "upper": 1416.1664328685868,
        "observations": 77456,
        "category": "overall",
        "observedAt": "2026-09-25",
        "modelVersion": "mistral-large-3"
      },
      "webdev": {
        "value": 1230.0379253861258,
        "rank": null,
        "lower": 1204.5476208847563,
        "upper": 1255.5282298874954,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-25",
        "modelVersion": "mistral-large-3"
      }
    }
  }
};
