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

export type TaskType = "general" | "classify_signal" | "quick_summary" | "market_insight" | "trade_reasoning" | "risk_narrative";
export type ModelTier = "cheap" | "balanced" | "deep";

export const TASK_TIER_MAP: Record<TaskType, ModelTier> = {
  general: "cheap",
  classify_signal: "cheap",
  quick_summary: "balanced",
  market_insight: "balanced",
  trade_reasoning: "deep",
  risk_narrative: "deep",
};

export const TIER_CREDIT_COST: Record<ModelTier, number> = { cheap: 1, balanced: 3, deep: 5 };

export function resolveTier(taskType: string, tierOverride?: string): ModelTier {
  if (tierOverride && MODELS[tierOverride as keyof typeof MODELS]) return tierOverride as ModelTier;
  return TASK_TIER_MAP[taskType as TaskType] || "balanced";
}

export function resolveModel(taskType: string, tierOverride?: string) {
  const tier = resolveTier(taskType, tierOverride);
  return MODELS[tier];
}