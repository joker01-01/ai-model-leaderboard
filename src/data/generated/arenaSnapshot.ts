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
  "generatedAt": "2026-08-15T03:50:22.702Z",
  "sourceUrl": "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
  "models": {
    "deepseek-v4-pro": {
      "agent": {
        "value": 0.0013587590747476115,
        "rank": null,
        "lower": -0.007413446391530614,
        "upper": 0.010130964541025838,
        "observations": 1389020,
        "category": "overall",
        "observedAt": "2026-08-13",
        "modelVersion": "DeepSeek V4 Pro"
      }
    },
    "claude-opus-4-8": {
      "text": {
        "value": 1473.5885585184208,
        "rank": null,
        "lower": 1468.9998954372352,
        "upper": 1478.1772215996061,
        "observations": 41219,
        "category": "overall",
        "observedAt": "2026-08-12",
        "modelVersion": "claude-opus-4-8"
      },
      "webdev": {
        "value": 1538.9551291784912,
        "rank": null,
        "lower": 1531.7325716353755,
        "upper": 1546.177686721607,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-08-14",
        "modelVersion": "claude-opus-4-8"
      },
      "agent": {
        "value": 0.021237417314482008,
        "rank": null,
        "lower": -0.00595799472430001,
        "upper": 0.048432829353264026,
        "observations": 1392959,
        "category": "overall",
        "observedAt": "2026-08-13",
        "modelVersion": "Claude Opus 4.8"
      }
    },
    "qwen-3-5": {
      "text": {
        "value": 1441.9739144664302,
        "rank": null,
        "lower": 1438.4677729898387,
        "upper": 1445.4800559430216,
        "observations": 66641,
        "category": "overall",
        "observedAt": "2026-08-12",
        "modelVersion": "qwen3.5-397b-a17b"
      },
      "webdev": {
        "value": 1400.1267384234584,
        "rank": null,
        "lower": 1394.637404532801,
        "upper": 1405.6160723141156,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-08-14",
        "modelVersion": "qwen3.5-397b-a17b"
      }
    },
    "claude-sonnet-4-6": {
      "text": {
        "value": 1472.055420303124,
        "rank": null,
        "lower": 1468.4365020750502,
        "upper": 1475.6743385311977,
        "observations": 66602,
        "category": "overall",
        "observedAt": "2026-08-12",
        "modelVersion": "claude-sonnet-4-6"
      },
      "webdev": {
        "value": 1523.6787757438246,
        "rank": null,
        "lower": 1518.1685879745507,
        "upper": 1529.1889635130988,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-08-14",
        "modelVersion": "claude-sonnet-4-6"
      },
      "agent": {
        "value": 0.0311659666938185,
        "rank": null,
        "lower": 0.017166872202375866,
        "upper": 0.04516506118526113,
        "observations": 1250934,
        "category": "overall",
        "observedAt": "2026-08-13",
        "modelVersion": "Claude Sonnet 4.6"
      }
    },
    "gemini-3-1-pro": {
      "text": {
        "value": 1486.2449879778885,
        "rank": null,
        "lower": 1482.907653091225,
        "upper": 1489.582322864552,
        "observations": 94989,
        "category": "overall",
        "observedAt": "2026-08-12",
        "modelVersion": "gemini-3.1-pro-preview"
      },
      "webdev": {
        "value": 1446.7871487156465,
        "rank": null,
        "lower": 1441.4178936932922,
        "upper": 1452.1564037380008,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-08-14",
        "modelVersion": "gemini-3.1-pro-preview"
      }
    },
    "minimax-m3": {
      "text": {
        "value": 1443.418549674021,
        "rank": null,
        "lower": 1438.7521617678021,
        "upper": 1448.08493758024,
        "observations": 37180,
        "category": "overall",
        "observedAt": "2026-08-12",
        "modelVersion": "minimax-m3"
      },
      "webdev": {
        "value": 1489.7577057450906,
        "rank": null,
        "lower": 1482.6072138265074,
        "upper": 1496.9081976636737,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-08-14",
        "modelVersion": "minimax-m3"
      }
    },
    "deepseek-v4-flash": {
      "agent": {
        "value": -0.021950938609330475,
        "rank": null,
        "lower": -0.030959141742423597,
        "upper": -0.012942735476237352,
        "observations": 1188280,
        "category": "overall",
        "observedAt": "2026-08-13",
        "modelVersion": "DeepSeek V4 Flash"
      }
    },
    "claude-fable-5": {
      "text": {
        "value": 1506.6310643625845,
        "rank": null,
        "lower": 1501.2038502055082,
        "upper": 1512.058278519661,
        "observations": 21439,
        "category": "overall",
        "observedAt": "2026-08-12",
        "modelVersion": "claude-fable-5"
      },
      "webdev": {
        "value": 1626.9493872808907,
        "rank": null,
        "lower": 1618.4898969645096,
        "upper": 1635.4088775972716,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-08-14",
        "modelVersion": "claude-fable-5"
      }
    },
    "mistral-large-3": {
      "text": {
        "value": 1414.7978753532723,
        "rank": null,
        "lower": 1411.6250655726208,
        "upper": 1417.970685133924,
        "observations": 59196,
        "category": "overall",
        "observedAt": "2026-08-12",
        "modelVersion": "mistral-large-3"
      },
      "webdev": {
        "value": 1230.1349177630286,
        "rank": null,
        "lower": 1204.3114140527946,
        "upper": 1255.958421473263,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-08-14",
        "modelVersion": "mistral-large-3"
      }
    }
  }
};
