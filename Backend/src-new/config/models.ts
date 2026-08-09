import { env } from "@config/env";

export const MODELS = {
  cheap: {
    id: env.MODEL_CHEAP,
    label: "Model murah (General, kategorisasi)",
    maxTokens: env.MODEL_CHEAP_MAX_TOKENS,
  },
  balanced: {
    id: env.MODEL_BALANCED,
    label: "Model seimbang (ringkasan, insight)",
    maxTokens: env.MODEL_BALANCED_MAX_TOKENS,
  },
  deep: {
    id: env.MODEL_DEEP,
    label: "Model dalam (analisis, narasi risiko)",
    maxTokens: env.MODEL_DEEP_MAX_TOKENS,
  },
};

export const TASK_TIER_MAP = {
  general: "cheap",
  classify_signal: "cheap",
  quick_summary: "balanced",
  market_insight: "balanced",
  trade_reasoning: "deep",
  risk_narrative: "deep",
};

export const TIER_CREDIT_COST = { cheap: 1, balanced: 3, deep: 5 };

export function resolveTier(taskType: string, tierOverride?: string): string {
  if (tierOverride && MODELS[tierOverride as keyof typeof MODELS]) return tierOverride;
  return TASK_TIER_MAP[taskType as keyof typeof TASK_TIER_MAP] || "balanced";
}

export function resolveModel(taskType: string, tierOverride?: string) {
  const tier = resolveTier(taskType, tierOverride);
  return MODELS[tier as keyof typeof MODELS];
}