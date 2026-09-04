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
  "generatedAt": "2026-09-04T09:22:20.364Z",
  "sourceUrl": "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
  "models": {
    "deepseek-v4-pro": {
      "agent": {
        "value": 0.000963551515408545,
        "rank": null,
        "lower": -0.00919643848224112,
        "upper": 0.011123541513058211,
        "observations": 1495823,
        "category": "overall",
        "observedAt": "2026-08-31",
        "modelVersion": "DeepSeek V4 Pro"
      }
    },
    "claude-opus-4-8": {
      "text": {
        "value": 1472.952873713257,
        "rank": null,
        "lower": 1468.6611335903942,
        "upper": 1477.24461383612,
        "observations": 49123,
        "category": "overall",
        "observedAt": "2026-09-01",
        "modelVersion": "claude-opus-4-8"
      },
      "webdev": {
        "value": 1539.947320027714,
        "rank": null,
        "lower": 1533.19132444342,
        "upper": 1546.703315612008,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-01",
        "modelVersion": "claude-opus-4-8"
      },
      "agent": {
        "value": 0.023317130536734038,
        "rank": null,
        "lower": -0.00266411355243135,
        "upper": 0.04929837462589942,
        "observations": 1437968,
        "category": "overall",
        "observedAt": "2026-08-31",
        "modelVersion": "Claude Opus 4.8"
      }
    },
    "qwen-3-5": {
      "text": {
        "value": 1441.3653907021758,
        "rank": null,
        "lower": 1437.9858136505857,
        "upper": 1444.7449677537659,
        "observations": 73400,
        "category": "overall",
        "observedAt": "2026-09-01",
        "modelVersion": "qwen3.5-397b-a17b"
      },
      "webdev": {
        "value": 1398.1927668184385,
        "rank": null,
        "lower": 1392.8859868249374,
        "upper": 1403.4995468119394,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-01",
        "modelVersion": "qwen3.5-397b-a17b"
      }
    },
    "claude-sonnet-4-6": {
      "text": {
        "value": 1472.3723127141732,
        "rank": null,
        "lower": 1468.7583255240875,
        "upper": 1475.9862999042589,
        "observations": 66343,
        "category": "overall",
        "observedAt": "2026-09-01",
        "modelVersion": "claude-sonnet-4-6"
      },
      "webdev": {
        "value": 1521.6249698732458,
        "rank": null,
        "lower": 1516.3089697256382,
        "upper": 1526.9409700208537,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-01",
        "modelVersion": "claude-sonnet-4-6"
      },
      "agent": {
        "value": 0.00951465055230567,
        "rank": null,
        "lower": -0.003154078808728122,
        "upper": 0.022183379913339463,
        "observations": 1371137,
        "category": "overall",
        "observedAt": "2026-08-31",
        "modelVersion": "Claude Sonnet 4.6"
      }
    },
    "gemini-3-1-pro": {
      "text": {
        "value": 1486.7458939140486,
        "rank": null,
        "lower": 1483.5285270523307,
        "upper": 1489.9632607757665,
        "observations": 102763,
        "category": "overall",
        "observedAt": "2026-09-01",
        "modelVersion": "gemini-3.1-pro-preview"
      },
      "webdev": {
        "value": 1445.6877553465831,
        "rank": null,
        "lower": 1440.4799669725103,
        "upper": 1450.895543720656,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-01",
        "modelVersion": "gemini-3.1-pro-preview"
      }
    },
    "minimax-m3": {
      "text": {
        "value": 1442.975730922721,
        "rank": null,
        "lower": 1438.6220238274493,
        "upper": 1447.3294380179925,
        "observations": 44544,
        "category": "overall",
        "observedAt": "2026-09-01",
        "modelVersion": "minimax-m3"
      },
      "webdev": {
        "value": 1486.7702075635343,
        "rank": null,
        "lower": 1480.019915216381,
        "upper": 1493.5204999106877,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-01",
        "modelVersion": "minimax-m3"
      }
    },
    "claude-fable-5": {
      "text": {
        "value": 1507.404584435896,
        "rank": null,
        "lower": 1502.4267820840125,
        "upper": 1512.382386787779,
        "observations": 26977,
        "category": "overall",
        "observedAt": "2026-09-01",
        "modelVersion": "claude-fable-5"
      },
      "webdev": {
        "value": 1627.795420212901,
        "rank": null,
        "lower": 1619.8473455238354,
        "upper": 1635.7434949019664,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-01",
        "modelVersion": "claude-fable-5"
      }
    },
    "mistral-large-3": {
      "text": {
        "value": 1413.5558747284936,
        "rank": null,
        "lower": 1410.4755015075148,
        "upper": 1416.6362479494721,
        "observations": 65336,
        "category": "overall",
        "observedAt": "2026-09-01",
        "modelVersion": "mistral-large-3"
      },
      "webdev": {
        "value": 1229.277886791384,
        "rank": null,
        "lower": 1203.3090350084474,
        "upper": 1255.2467385743207,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-09-01",
        "modelVersion": "mistral-large-3"
      }
    }
  }
};
