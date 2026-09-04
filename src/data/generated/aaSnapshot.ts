/** 由 `npm run sync:data` 生成；请不要手工编辑。 */
export interface SyncedAaMetric {
  value: number;
  modelVersion: string;
  observedAt: string;
  sourceId: string;
  sourceSlug: string;
}

export interface AaSnapshot {
  generatedAt: string | null;
  source: "Artificial Analysis Data API" | "manual";
  sourceUrl: string;
  models: Record<string, Partial<Record<"intelligence" | "coding", SyncedAaMetric>>>;
}

export const AA_SNAPSHOT: AaSnapshot = {
  "generatedAt": "2026-09-04T09:22:20.364Z",
  "source": "Artificial Analysis Data API",
  "sourceUrl": "https://artificialanalysis.ai/data-api/docs",
  "models": {
    "claude-opus-4-8": {
      "intelligence": {
        "value": 57.3,
        "modelVersion": "Claude Opus 4.8 (Adaptive Reasoning, Max Effort)",
        "observedAt": "2026-09-04",
        "sourceId": "992b7b84-5069-4c6a-9295-834252553d50",
        "sourceSlug": "claude-opus-4-8"
      },
      "coding": {
        "value": 74.3,
        "modelVersion": "Claude Opus 4.8 (Adaptive Reasoning, Max Effort)",
        "observedAt": "2026-09-04",
        "sourceId": "992b7b84-5069-4c6a-9295-834252553d50",
        "sourceSlug": "claude-opus-4-8"
      }
    },
    "gpt-56-sol": {
      "intelligence": {
        "value": 60.9,
        "modelVersion": "GPT-5.6 Sol (max)",
        "observedAt": "2026-09-04",
        "sourceId": "d93edfe8-bf35-49ad-b56e-b18116142a1c",
        "sourceSlug": "gpt-5-6-sol"
      },
      "coding": {
        "value": 77.4,
        "modelVersion": "GPT-5.6 Sol (max)",
        "observedAt": "2026-09-04",
        "sourceId": "d93edfe8-bf35-49ad-b56e-b18116142a1c",
        "sourceSlug": "gpt-5-6-sol"
      }
    },
    "gpt-56-luna": {
      "intelligence": {
        "value": 52.3,
        "modelVersion": "GPT-5.6 Luna (max)",
        "observedAt": "2026-09-04",
        "sourceId": "426d24c8-49ae-482a-b4a8-20f1c53f21c1",
        "sourceSlug": "gpt-5-6-luna"
      },
      "coding": {
        "value": 71.4,
        "modelVersion": "GPT-5.6 Luna (max)",
        "observedAt": "2026-09-04",
        "sourceId": "426d24c8-49ae-482a-b4a8-20f1c53f21c1",
        "sourceSlug": "gpt-5-6-luna"
      }
    },
    "gemini-3-7-flash": {
      "intelligence": {
        "value": 56,
        "modelVersion": "Gemini 3.7 Flash (high)",
        "observedAt": "2026-09-04",
        "sourceId": "b2331108-72ed-415a-82d1-188633875bbc",
        "sourceSlug": "gemini-3-7-flash"
      },
      "coding": {
        "value": 76.1,
        "modelVersion": "Gemini 3.7 Flash (high)",
        "observedAt": "2026-09-04",
        "sourceId": "b2331108-72ed-415a-82d1-188633875bbc",
        "sourceSlug": "gemini-3-7-flash"
      }
    },
    "qwen-3-5": {
      "intelligence": {
        "value": 34.3,
        "modelVersion": "Qwen3.5 397B A17B (Reasoning)",
        "observedAt": "2026-09-04",
        "sourceId": "0e66bae9-41f1-42fc-9276-ce8cb6f72919",
        "sourceSlug": "qwen3-5-397b-a17b"
      },
      "coding": {
        "value": 48.2,
        "modelVersion": "Qwen3.5 397B A17B (Reasoning)",
        "observedAt": "2026-09-04",
        "sourceId": "0e66bae9-41f1-42fc-9276-ce8cb6f72919",
        "sourceSlug": "qwen3-5-397b-a17b"
      }
    },
    "claude-sonnet-4-6": {
      "intelligence": {
        "value": 36.8,
        "modelVersion": "Claude Sonnet 4.6 (Non-reasoning, High Effort)",
        "observedAt": "2026-09-04",
        "sourceId": "2e40e695-3cec-43da-83f9-615af30b8e91",
        "sourceSlug": "claude-sonnet-4-6"
      }
    },
    "glm-5-3": {
      "intelligence": {
        "value": 59.5,
        "modelVersion": "GLM-5.3 (max)",
        "observedAt": "2026-09-04",
        "sourceId": "cd684ea4-b475-4269-b001-d469d06d8a7a",
        "sourceSlug": "glm-5-3"
      },
      "coding": {
        "value": 74.8,
        "modelVersion": "GLM-5.3 (max)",
        "observedAt": "2026-09-04",
        "sourceId": "cd684ea4-b475-4269-b001-d469d06d8a7a",
        "sourceSlug": "glm-5-3"
      }
    },
    "grok-4-6": {
      "intelligence": {
        "value": 60.9,
        "modelVersion": "Grok 4.6 (high)",
        "observedAt": "2026-09-04",
        "sourceId": "c8adc5cf-fd5a-407b-af51-dc3bede3e49c",
        "sourceSlug": "grok-4-6"
      },
      "coding": {
        "value": 76.8,
        "modelVersion": "Grok 4.6 (high)",
        "observedAt": "2026-09-04",
        "sourceId": "c8adc5cf-fd5a-407b-af51-dc3bede3e49c",
        "sourceSlug": "grok-4-6"
      }
    },
    "kimi-k3": {
      "intelligence": {
        "value": 59.7,
        "modelVersion": "Kimi K3 (max)",
        "observedAt": "2026-09-04",
        "sourceId": "f7d2fc3e-1f7b-405f-818c-07952a4af78f",
        "sourceSlug": "kimi-k3"
      },
      "coding": {
        "value": 76.2,
        "modelVersion": "Kimi K3 (max)",
        "observedAt": "2026-09-04",
        "sourceId": "f7d2fc3e-1f7b-405f-818c-07952a4af78f",
        "sourceSlug": "kimi-k3"
      }
    },
    "gemini-3-1-pro": {
      "intelligence": {
        "value": 47.7,
        "modelVersion": "Gemini 3.1 Pro Preview",
        "observedAt": "2026-09-04",
        "sourceId": "bbd93ebe-80da-4594-bb19-61e69d0331df",
        "sourceSlug": "gemini-3-1-pro-preview"
      },
      "coding": {
        "value": 68.8,
        "modelVersion": "Gemini 3.1 Pro Preview",
        "observedAt": "2026-09-04",
        "sourceId": "bbd93ebe-80da-4594-bb19-61e69d0331df",
        "sourceSlug": "gemini-3-1-pro-preview"
      }
    },
    "minimax-m3": {
      "intelligence": {
        "value": 45.4,
        "modelVersion": "MiniMax-M3",
        "observedAt": "2026-09-04",
        "sourceId": "277f939a-985b-4b37-859d-b3eabc7c0b26",
        "sourceSlug": "minimax-m3"
      },
      "coding": {
        "value": 58.6,
        "modelVersion": "MiniMax-M3",
        "observedAt": "2026-09-04",
        "sourceId": "277f939a-985b-4b37-859d-b3eabc7c0b26",
        "sourceSlug": "minimax-m3"
      }
    },
    "claude-fable-5": {
      "intelligence": {
        "value": 62.1,
        "modelVersion": "Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)",
        "observedAt": "2026-09-04",
        "sourceId": "cd55210d-358e-4df1-ba9c-9acb5f186cc9",
        "sourceSlug": "claude-fable-5"
      },
      "coding": {
        "value": 76.5,
        "modelVersion": "Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)",
        "observedAt": "2026-09-04",
        "sourceId": "cd55210d-358e-4df1-ba9c-9acb5f186cc9",
        "sourceSlug": "claude-fable-5"
      }
    },
    "grok-4-20": {
      "intelligence": {
        "value": 38,
        "modelVersion": "Grok 4.20 0309 v2 (Reasoning)",
        "observedAt": "2026-09-04",
        "sourceId": "c72cb85a-18a4-4235-b455-77dff2f16c50",
        "sourceSlug": "grok-4-20"
      }
    },
    "motif-3": {
      "intelligence": {
        "value": 47.4,
        "modelVersion": "Motif 3",
        "observedAt": "2026-09-04",
        "sourceId": "b01eefb1-c9f8-412d-8353-571031a52f23",
        "sourceSlug": "motif-3"
      },
      "coding": {
        "value": 63.5,
        "modelVersion": "Motif 3",
        "observedAt": "2026-09-04",
        "sourceId": "b01eefb1-c9f8-412d-8353-571031a52f23",
        "sourceSlug": "motif-3"
      }
    },
    "mistral-large-3": {
      "intelligence": {
        "value": 15.9,
        "modelVersion": "Mistral Large 3",
        "observedAt": "2026-09-04",
        "sourceId": "4928e950-7f37-4475-b0dc-c5bad781a321",
        "sourceSlug": "mistral-large-3"
      },
      "coding": {
        "value": 20.1,
        "modelVersion": "Mistral Large 3",
        "observedAt": "2026-09-04",
        "sourceId": "4928e950-7f37-4475-b0dc-c5bad781a321",
        "sourceSlug": "mistral-large-3"
      }
    }
  }
};
