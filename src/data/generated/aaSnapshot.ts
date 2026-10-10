/** 由 `npm run sync:data` 生成；请不要手工编辑。 */
export interface SyncedAaMetric {
  value: number;
  modelVersion: string;
  observedAt: string;
  sourceId: string;
  sourceSlug: string;
}

export interface SyncedAaLeaderboardEntry {
  sourceId: string;
  sourceSlug: string;
  modelVersion: string;
  creatorId: string | null;
  creatorName: string | null;
  releaseDate: string | null;
  value: number;
  observedAt: string;
}

export interface AaSnapshot {
  generatedAt: string | null;
  source: "Artificial Analysis Data API" | "manual";
  sourceUrl: string;
  intelligenceIndexVersion: number;
  intelligenceLeaderboard: SyncedAaLeaderboardEntry[];
  models: Record<string, Partial<Record<"intelligence" | "coding", SyncedAaMetric>>>;
}

export const AA_SNAPSHOT: AaSnapshot = {
  "generatedAt": "2026-10-10T20:35:07.193Z",
  "source": "Artificial Analysis Data API",
  "sourceUrl": "https://artificialanalysis.ai/data-api/docs",
  "intelligenceIndexVersion": 4.3,
  "intelligenceLeaderboard": [
    {
      "sourceId": "2f3c4dc9-a450-4303-8697-0237257cf08f",
      "sourceSlug": "claude-opus-5-5",
      "modelVersion": "Claude Opus 5.5 (Max, Default Fallback)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-09-22",
      "value": 57.6,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "df5bf99d-d228-4715-b41b-19ca86118777",
      "sourceSlug": "claude-opus-5-5-xhigh",
      "modelVersion": "Claude Opus 5.5 (Xhigh, Default Fallback)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-09-22",
      "value": 56,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "b171d979-5ec1-45de-b8b9-db1ee65e77ec",
      "sourceSlug": "claude-sonnet-5-5",
      "modelVersion": "Claude Sonnet 5.5 (Max, Default Fallback)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-09-28",
      "value": 56,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "f314eade-2232-44bf-a3ab-9b326bc67de6",
      "sourceSlug": "claude-opus-5-5-high",
      "modelVersion": "Claude Opus 5.5 (High, Default Fallback)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-09-22",
      "value": 53.6,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "3e87c73e-a257-495e-9730-367a66229811",
      "sourceSlug": "claude-fable-5-1",
      "modelVersion": "Claude Fable 5.1 (Max, Default Fallback)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-09-01",
      "value": 53.4,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "9b166bf3-42db-4f63-8338-1c4a1244ffe8",
      "sourceSlug": "claude-fable-5-1-xhigh",
      "modelVersion": "Claude Fable 5.1 (Xhigh, Default Fallback)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-09-01",
      "value": 53.2,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "2f339a97-9a0d-499a-9cb5-e0db665bfa25",
      "sourceSlug": "gpt-6-astra",
      "modelVersion": "GPT-6 Astra (Max)",
      "creatorId": "e67e56e3-15cd-43db-b679-da4660a69f41",
      "creatorName": "OpenAI",
      "releaseDate": "2026-09-03",
      "value": 52.7,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "d366dfa1-d940-4788-aa73-d298c45699b3",
      "sourceSlug": "gemini-4-argon",
      "modelVersion": "Gemini 4 Argon (High)",
      "creatorId": "faddc6d9-2c14-445f-9b28-56726f59c793",
      "creatorName": "Google",
      "releaseDate": "2026-09-30",
      "value": 52.6,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "1f541ef3-913f-4eb2-9d07-0e93c7a9a5e3",
      "sourceSlug": "gpt-6-astra-xhigh",
      "modelVersion": "GPT-6 Astra (Xhigh)",
      "creatorId": "e67e56e3-15cd-43db-b679-da4660a69f41",
      "creatorName": "OpenAI",
      "releaseDate": "2026-09-03",
      "value": 52.4,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "975aeaef-50bd-4a65-9c73-f1015adcd4d4",
      "sourceSlug": "claude-sonnet-5-5-xhigh",
      "modelVersion": "Claude Sonnet 5.5 (Xhigh, Default Fallback)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-09-28",
      "value": 51.9,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "b25ac058-1e33-4c31-bbc9-a20c3ad0717a",
      "sourceSlug": "gpt-6-1-sol",
      "modelVersion": "GPT-6.1 Sol (Max)",
      "creatorId": "e67e56e3-15cd-43db-b679-da4660a69f41",
      "creatorName": "OpenAI",
      "releaseDate": "2026-09-29",
      "value": 51.8,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "9d7d72cd-d95d-45a0-b109-4ad292c9aabd",
      "sourceSlug": "claude-fable-5-1-high",
      "modelVersion": "Claude Fable 5.1 (High, Default Fallback)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-09-01",
      "value": 51.2,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "ea9e0da6-169f-43c6-92f5-730a10d6ff8d",
      "sourceSlug": "claude-opus-5-5-medium",
      "modelVersion": "Claude Opus 5.5 (Medium, Default Fallback)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-09-22",
      "value": 51.2,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "092a3b0e-c5c8-45dc-bf1b-53673c8ff352",
      "sourceSlug": "gpt-6-1-sol-xhigh",
      "modelVersion": "GPT-6.1 Sol (Xhigh)",
      "creatorId": "e67e56e3-15cd-43db-b679-da4660a69f41",
      "creatorName": "OpenAI",
      "releaseDate": "2026-09-29",
      "value": 51,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "e05a4828-0536-4876-870d-a235023f992b",
      "sourceSlug": "gpt-6-astra-high",
      "modelVersion": "GPT-6 Astra (High)",
      "creatorId": "e67e56e3-15cd-43db-b679-da4660a69f41",
      "creatorName": "OpenAI",
      "releaseDate": "2026-09-03",
      "value": 50.9,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "b8fc61f7-5e9a-49e6-8547-6ac56db24627",
      "sourceSlug": "claude-opus-5",
      "modelVersion": "Claude Opus 5 (Max)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-07-24",
      "value": 50.8,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "3b84fee3-b70a-41bc-819e-5fbdef9a0042",
      "sourceSlug": "gpt-6-1-sol-high",
      "modelVersion": "GPT-6.1 Sol (High)",
      "creatorId": "e67e56e3-15cd-43db-b679-da4660a69f41",
      "creatorName": "OpenAI",
      "releaseDate": "2026-09-29",
      "value": 50.2,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "1305c921-7aaa-4d6d-99b5-99b3acf15e19",
      "sourceSlug": "claude-opus-5-xhigh",
      "modelVersion": "Claude Opus 5 (Xhigh)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-07-24",
      "value": 49.7,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "cd55210d-358e-4df1-ba9c-9acb5f186cc9",
      "sourceSlug": "claude-fable-5",
      "modelVersion": "Claude Fable 5 (Max, Opus 4.8 Fallback)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-06-09",
      "value": 49.6,
      "observedAt": "2026-10-10"
    },
    {
      "sourceId": "e97a4ef5-e817-480e-9595-12f81dc4974f",
      "sourceSlug": "gpt-6-astra-medium",
      "modelVersion": "GPT-6 Astra (Medium)",
      "creatorId": "e67e56e3-15cd-43db-b679-da4660a69f41",
      "creatorName": "OpenAI",
      "releaseDate": "2026-09-03",
      "value": 49.6,
      "observedAt": "2026-10-10"
    }
  ],
  "models": {
    "claude-opus-4-8": {
      "intelligence": {
        "value": 41.8,
        "modelVersion": "Claude Opus 4.8 (Max)",
        "observedAt": "2026-10-10",
        "sourceId": "992b7b84-5069-4c6a-9295-834252553d50",
        "sourceSlug": "claude-opus-4-8"
      },
      "coding": {
        "value": 74.3,
        "modelVersion": "Claude Opus 4.8 (Max)",
        "observedAt": "2026-10-10",
        "sourceId": "992b7b84-5069-4c6a-9295-834252553d50",
        "sourceSlug": "claude-opus-4-8"
      }
    },
    "gpt-56-sol": {
      "intelligence": {
        "value": 47,
        "modelVersion": "GPT-5.6 Sol (Max)",
        "observedAt": "2026-10-10",
        "sourceId": "d93edfe8-bf35-49ad-b56e-b18116142a1c",
        "sourceSlug": "gpt-5-6-sol"
      },
      "coding": {
        "value": 77.4,
        "modelVersion": "GPT-5.6 Sol (Max)",
        "observedAt": "2026-10-10",
        "sourceId": "d93edfe8-bf35-49ad-b56e-b18116142a1c",
        "sourceSlug": "gpt-5-6-sol"
      }
    },
    "gpt-56-luna": {
      "intelligence": {
        "value": 37.3,
        "modelVersion": "GPT-5.6 Luna (Max)",
        "observedAt": "2026-10-10",
        "sourceId": "426d24c8-49ae-482a-b4a8-20f1c53f21c1",
        "sourceSlug": "gpt-5-6-luna"
      },
      "coding": {
        "value": 71.4,
        "modelVersion": "GPT-5.6 Luna (Max)",
        "observedAt": "2026-10-10",
        "sourceId": "426d24c8-49ae-482a-b4a8-20f1c53f21c1",
        "sourceSlug": "gpt-5-6-luna"
      }
    },
    "gemini-3-7-flash": {
      "intelligence": {
        "value": 39.1,
        "modelVersion": "Gemini 3.7 Flash (High)",
        "observedAt": "2026-10-10",
        "sourceId": "b2331108-72ed-415a-82d1-188633875bbc",
        "sourceSlug": "gemini-3-7-flash"
      },
      "coding": {
        "value": 76.1,
        "modelVersion": "Gemini 3.7 Flash (High)",
        "observedAt": "2026-10-10",
        "sourceId": "b2331108-72ed-415a-82d1-188633875bbc",
        "sourceSlug": "gemini-3-7-flash"
      }
    },
    "qwen-3-5": {
      "intelligence": {
        "value": 18.4,
        "modelVersion": "Qwen3.5 397B A17B (Reasoning)",
        "observedAt": "2026-10-10",
        "sourceId": "0e66bae9-41f1-42fc-9276-ce8cb6f72919",
        "sourceSlug": "qwen3-5-397b-a17b"
      },
      "coding": {
        "value": 48.2,
        "modelVersion": "Qwen3.5 397B A17B (Reasoning)",
        "observedAt": "2026-10-10",
        "sourceId": "0e66bae9-41f1-42fc-9276-ce8cb6f72919",
        "sourceSlug": "qwen3-5-397b-a17b"
      }
    },
    "claude-sonnet-4-6": {
      "intelligence": {
        "value": 24.7,
        "modelVersion": "Claude Sonnet 4.6 (Non-reasoning, High)",
        "observedAt": "2026-10-10",
        "sourceId": "2e40e695-3cec-43da-83f9-615af30b8e91",
        "sourceSlug": "claude-sonnet-4-6"
      }
    },
    "glm-5-3": {
      "intelligence": {
        "value": 44.8,
        "modelVersion": "GLM-5.3 (Max)",
        "observedAt": "2026-10-10",
        "sourceId": "cd684ea4-b475-4269-b001-d469d06d8a7a",
        "sourceSlug": "glm-5-3"
      },
      "coding": {
        "value": 74.8,
        "modelVersion": "GLM-5.3 (Max)",
        "observedAt": "2026-10-10",
        "sourceId": "cd684ea4-b475-4269-b001-d469d06d8a7a",
        "sourceSlug": "glm-5-3"
      }
    },
    "grok-4-6": {
      "intelligence": {
        "value": 44.3,
        "modelVersion": "Grok 4.6 (High)",
        "observedAt": "2026-10-10",
        "sourceId": "c8adc5cf-fd5a-407b-af51-dc3bede3e49c",
        "sourceSlug": "grok-4-6"
      },
      "coding": {
        "value": 76.8,
        "modelVersion": "Grok 4.6 (High)",
        "observedAt": "2026-10-10",
        "sourceId": "c8adc5cf-fd5a-407b-af51-dc3bede3e49c",
        "sourceSlug": "grok-4-6"
      }
    },
    "kimi-k3": {
      "intelligence": {
        "value": 43.6,
        "modelVersion": "Kimi K3 (Max)",
        "observedAt": "2026-10-10",
        "sourceId": "f7d2fc3e-1f7b-405f-818c-07952a4af78f",
        "sourceSlug": "kimi-k3"
      },
      "coding": {
        "value": 76.2,
        "modelVersion": "Kimi K3 (Max)",
        "observedAt": "2026-10-10",
        "sourceId": "f7d2fc3e-1f7b-405f-818c-07952a4af78f",
        "sourceSlug": "kimi-k3"
      }
    },
    "gemini-3-1-pro": {
      "intelligence": {
        "value": 29.7,
        "modelVersion": "Gemini 3.1 Pro Preview",
        "observedAt": "2026-10-10",
        "sourceId": "bbd93ebe-80da-4594-bb19-61e69d0331df",
        "sourceSlug": "gemini-3-1-pro-preview"
      },
      "coding": {
        "value": 68.8,
        "modelVersion": "Gemini 3.1 Pro Preview",
        "observedAt": "2026-10-10",
        "sourceId": "bbd93ebe-80da-4594-bb19-61e69d0331df",
        "sourceSlug": "gemini-3-1-pro-preview"
      }
    },
    "minimax-m3": {
      "intelligence": {
        "value": 29.2,
        "modelVersion": "MiniMax-M3",
        "observedAt": "2026-10-10",
        "sourceId": "277f939a-985b-4b37-859d-b3eabc7c0b26",
        "sourceSlug": "minimax-m3"
      },
      "coding": {
        "value": 58.6,
        "modelVersion": "MiniMax-M3",
        "observedAt": "2026-10-10",
        "sourceId": "277f939a-985b-4b37-859d-b3eabc7c0b26",
        "sourceSlug": "minimax-m3"
      }
    },
    "claude-fable-5": {
      "intelligence": {
        "value": 49.6,
        "modelVersion": "Claude Fable 5 (Max, Opus 4.8 Fallback)",
        "observedAt": "2026-10-10",
        "sourceId": "cd55210d-358e-4df1-ba9c-9acb5f186cc9",
        "sourceSlug": "claude-fable-5"
      },
      "coding": {
        "value": 76.5,
        "modelVersion": "Claude Fable 5 (Max, Opus 4.8 Fallback)",
        "observedAt": "2026-10-10",
        "sourceId": "cd55210d-358e-4df1-ba9c-9acb5f186cc9",
        "sourceSlug": "claude-fable-5"
      }
    },
    "grok-4-20": {
      "intelligence": {
        "value": 25.7,
        "modelVersion": "Grok 4.20 0309 v2 (Reasoning)",
        "observedAt": "2026-10-10",
        "sourceId": "c72cb85a-18a4-4235-b455-77dff2f16c50",
        "sourceSlug": "grok-4-20"
      }
    },
    "motif-3": {
      "intelligence": {
        "value": 33.6,
        "modelVersion": "Motif 3",
        "observedAt": "2026-10-10",
        "sourceId": "b01eefb1-c9f8-412d-8353-571031a52f23",
        "sourceSlug": "motif-3"
      },
      "coding": {
        "value": 63.5,
        "modelVersion": "Motif 3",
        "observedAt": "2026-10-10",
        "sourceId": "b01eefb1-c9f8-412d-8353-571031a52f23",
        "sourceSlug": "motif-3"
      }
    },
    "mistral-large-3": {
      "intelligence": {
        "value": 9.3,
        "modelVersion": "Mistral Large 3",
        "observedAt": "2026-10-10",
        "sourceId": "4928e950-7f37-4475-b0dc-c5bad781a321",
        "sourceSlug": "mistral-large-3"
      },
      "coding": {
        "value": 20.1,
        "modelVersion": "Mistral Large 3",
        "observedAt": "2026-10-10",
        "sourceId": "4928e950-7f37-4475-b0dc-c5bad781a321",
        "sourceSlug": "mistral-large-3"
      }
    }
  }
};
