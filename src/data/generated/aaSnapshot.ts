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
  "generatedAt": "2026-09-04T10:59:01.436Z",
  "source": "Artificial Analysis Data API",
  "sourceUrl": "https://artificialanalysis.ai/data-api/docs",
  "intelligenceIndexVersion": 4.1,
  "intelligenceLeaderboard": [
    {
      "sourceId": "3e87c73e-a257-495e-9730-367a66229811",
      "sourceSlug": "claude-fable-5-1",
      "modelVersion": "Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-09-01",
      "value": 65.7,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "9b166bf3-42db-4f63-8338-1c4a1244ffe8",
      "sourceSlug": "claude-fable-5-1-xhigh",
      "modelVersion": "Claude Fable 5.1 (Adaptive Reasoning, Xhigh Effort, Default Fallback)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-09-01",
      "value": 64.8,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "b8fc61f7-5e9a-49e6-8547-6ac56db24627",
      "sourceSlug": "claude-opus-5",
      "modelVersion": "Claude Opus 5 (Adaptive Reasoning, Max Effort)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-07-24",
      "value": 63.1,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "9d7d72cd-d95d-45a0-b109-4ad292c9aabd",
      "sourceSlug": "claude-fable-5-1-high",
      "modelVersion": "Claude Fable 5.1 (Adaptive Reasoning, High Effort, Default Fallback)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-09-01",
      "value": 62.5,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "1305c921-7aaa-4d6d-99b5-99b3acf15e19",
      "sourceSlug": "claude-opus-5-xhigh",
      "modelVersion": "Claude Opus 5 (Adaptive Reasoning, Xhigh Effort)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-07-24",
      "value": 62.5,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "cd55210d-358e-4df1-ba9c-9acb5f186cc9",
      "sourceSlug": "claude-fable-5",
      "modelVersion": "Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-06-09",
      "value": 62.1,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "58a40aba-a44f-457f-9cca-75b43d4e6934",
      "sourceSlug": "muse-spark-1-3",
      "modelVersion": "Muse Spark 1.3 (max)",
      "creatorId": "e1694725-0192-4e54-b1b8-c97e816c6cbe",
      "creatorName": "Meta",
      "releaseDate": "2026-09-02",
      "value": 62.1,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "712be54a-77ae-41b2-9a58-21181479d6ee",
      "sourceSlug": "claude-opus-5-high",
      "modelVersion": "Claude Opus 5 (Adaptive Reasoning, High Effort)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-07-24",
      "value": 61.5,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "2f339a97-9a0d-499a-9cb5-e0db665bfa25",
      "sourceSlug": "gpt-6-astra",
      "modelVersion": "GPT-6 Astra (max)",
      "creatorId": "e67e56e3-15cd-43db-b679-da4660a69f41",
      "creatorName": "OpenAI",
      "releaseDate": "2026-09-03",
      "value": 61.2,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "1f541ef3-913f-4eb2-9d07-0e93c7a9a5e3",
      "sourceSlug": "gpt-6-astra-xhigh",
      "modelVersion": "GPT-6 Astra (xhigh)",
      "creatorId": "e67e56e3-15cd-43db-b679-da4660a69f41",
      "creatorName": "OpenAI",
      "releaseDate": "2026-09-03",
      "value": 61,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "d93edfe8-bf35-49ad-b56e-b18116142a1c",
      "sourceSlug": "gpt-5-6-sol",
      "modelVersion": "GPT-5.6 Sol (max)",
      "creatorId": "e67e56e3-15cd-43db-b679-da4660a69f41",
      "creatorName": "OpenAI",
      "releaseDate": "2026-07-09",
      "value": 60.9,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "c8adc5cf-fd5a-407b-af51-dc3bede3e49c",
      "sourceSlug": "grok-4-6",
      "modelVersion": "Grok 4.6 (high)",
      "creatorId": "a1e3ddcf-d3e4-44a5-9e8f-029a69850875",
      "creatorName": "SpaceXAI",
      "releaseDate": "2026-08-12",
      "value": 60.9,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "d5170215-69be-4129-849b-26d8d8825bfc",
      "sourceSlug": "muse-spark-1-3-xhigh",
      "modelVersion": "Muse Spark 1.3 (xhigh)",
      "creatorId": "e1694725-0192-4e54-b1b8-c97e816c6cbe",
      "creatorName": "Meta",
      "releaseDate": "2026-09-02",
      "value": 60.8,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "3b7de71c-e034-4591-8ca6-6b6be2fa471f",
      "sourceSlug": "claude-fable-5-1-medium",
      "modelVersion": "Claude Fable 5.1 (Adaptive Reasoning, Medium Effort, Default Fallback)",
      "creatorId": "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
      "creatorName": "Anthropic",
      "releaseDate": "2026-09-01",
      "value": 60.5,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "e05a4828-0536-4876-870d-a235023f992b",
      "sourceSlug": "gpt-6-astra-high",
      "modelVersion": "GPT-6 Astra (high)",
      "creatorId": "e67e56e3-15cd-43db-b679-da4660a69f41",
      "creatorName": "OpenAI",
      "releaseDate": "2026-09-03",
      "value": 60.3,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "d6f43d0a-e8c4-447c-9ff7-5cf0a9d59aa3",
      "sourceSlug": "grok-4-6-xhigh",
      "modelVersion": "Grok 4.6 (xhigh)",
      "creatorId": "a1e3ddcf-d3e4-44a5-9e8f-029a69850875",
      "creatorName": "SpaceXAI",
      "releaseDate": "2026-08-12",
      "value": 60,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "f7d2fc3e-1f7b-405f-818c-07952a4af78f",
      "sourceSlug": "kimi-k3",
      "modelVersion": "Kimi K3 (max)",
      "creatorId": "0a177021-87dd-4250-9a37-f01df196bfe0",
      "creatorName": "Kimi",
      "releaseDate": "2026-07-16",
      "value": 59.7,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "cd684ea4-b475-4269-b001-d469d06d8a7a",
      "sourceSlug": "glm-5-3",
      "modelVersion": "GLM-5.3 (max)",
      "creatorId": "67437eb6-7dc1-4e93-befd-22c8b8ec2065",
      "creatorName": "Z AI",
      "releaseDate": "2026-08-18",
      "value": 59.5,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "e97a4ef5-e817-480e-9595-12f81dc4974f",
      "sourceSlug": "gpt-6-astra-medium",
      "modelVersion": "GPT-6 Astra (medium)",
      "creatorId": "e67e56e3-15cd-43db-b679-da4660a69f41",
      "creatorName": "OpenAI",
      "releaseDate": "2026-09-03",
      "value": 59.2,
      "observedAt": "2026-09-04"
    },
    {
      "sourceId": "d998db47-9b67-4727-a2bb-2e1261020ac0",
      "sourceSlug": "gpt-5-6-sol-xhigh",
      "modelVersion": "GPT-5.6 Sol (xhigh)",
      "creatorId": "e67e56e3-15cd-43db-b679-da4660a69f41",
      "creatorName": "OpenAI",
      "releaseDate": "2026-07-09",
      "value": 59,
      "observedAt": "2026-09-04"
    }
  ],
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
