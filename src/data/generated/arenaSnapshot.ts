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
  "generatedAt": "2026-10-02T21:21:05.777Z",
  "sourceUrl": "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
  "models": {
    "claude-opus-4-8": {
      "text": {
        "value": 1474.5219547762822,
        "rank": null,
        "lower": 1470.6686389844604,
        "upper": 1478.3752705681036,
        "observations": 64711,
        "category": "overall",
        "observedAt": "2026-09-30",
        "modelVersion": "claude-opus-4-8"
      },
      "webdev": {
        "value": 1534.126493563194,
        "rank": null,
        "lower": 1528.4897777656472,
        "upper": 1539.7632093607406,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-01",
        "modelVersion": "claude-opus-4-8"
      }
    },
    "qwen-3-5": {
      "text": {
        "value": 1441.5698581632387,
        "rank": null,
        "lower": 1438.4154603347415,
        "upper": 1444.7242559917358,
        "observations": 88092,
        "category": "overall",
        "observedAt": "2026-09-30",
        "modelVersion": "qwen3.5-397b-a17b"
      },
      "webdev": {
        "value": 1399.441650260092,
        "rank": null,
        "lower": 1394.338172635512,
        "upper": 1404.5451278846726,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-01",
        "modelVersion": "qwen3.5-397b-a17b"
      }
    },
    "claude-sonnet-4-6": {
      "text": {
        "value": 1472.1313675940137,
        "rank": null,
        "lower": 1468.6109815855002,
        "upper": 1475.6517536025276,
        "observations": 70828,
        "category": "overall",
        "observedAt": "2026-09-30",
        "modelVersion": "claude-sonnet-4-6"
      },
      "webdev": {
        "value": 1521.4337134729947,
        "rank": null,
        "lower": 1516.301056779269,
        "upper": 1526.5663701667204,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-01",
        "modelVersion": "claude-sonnet-4-6"
      }
    },
    "gemini-3-1-pro": {
      "text": {
        "value": 1486.9640790545382,
        "rank": null,
        "lower": 1483.9494759400204,
        "upper": 1489.9786821690554,
        "observations": 121225,
        "category": "overall",
        "observedAt": "2026-09-30",
        "modelVersion": "gemini-3.1-pro-preview"
      },
      "webdev": {
        "value": 1446.2003008341799,
        "rank": null,
        "lower": 1441.1608563399018,
        "upper": 1451.239745328458,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-01",
        "modelVersion": "gemini-3.1-pro-preview"
      }
    },
    "minimax-m3": {
      "text": {
        "value": 1439.7383865722736,
        "rank": null,
        "lower": 1435.784625596188,
        "upper": 1443.6921475483596,
        "observations": 58171,
        "category": "overall",
        "observedAt": "2026-09-30",
        "modelVersion": "minimax-m3"
      },
      "webdev": {
        "value": 1482.0361632685358,
        "rank": null,
        "lower": 1476.3567507257194,
        "upper": 1487.715575811352,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-01",
        "modelVersion": "minimax-m3"
      }
    },
    "mistral-large-3": {
      "text": {
        "value": 1413.7170268814298,
        "rank": null,
        "lower": 1410.814913463878,
        "upper": 1416.6191402989816,
        "observations": 78986,
        "category": "overall",
        "observedAt": "2026-09-30",
        "modelVersion": "mistral-large-3"
      },
      "webdev": {
        "value": 1229.7568442127579,
        "rank": null,
        "lower": 1204.2941969591675,
        "upper": 1255.2194914663482,
        "observations": null,
        "category": "overall",
        "observedAt": "2026-10-01",
        "modelVersion": "mistral-large-3"
      }
    }
  }
};
