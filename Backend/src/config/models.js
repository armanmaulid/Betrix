export const MODELS = {
  cheap: {
    id: process.env.MODEL_CHEAP || "kr/claude-haiku-4.5",
    label: "Model murah (FAQ, kategorisasi)",
    maxTokens: parseInt(process.env.MODEL_CHEAP_MAX_TOKENS) || 1024,
  },
  balanced: {
    id: process.env.MODEL_BALANCED || "kr/qwen3.7-max",
    label: "Model seimbang (ringkasan, insight)",
    maxTokens: parseInt(process.env.MODEL_BALANCED_MAX_TOKENS) || 2048,
  },
  deep: {
    id: process.env.MODEL_DEEP || "kr/claude-opus-4.7",
    label: "Model dalam (analisis, narasi risiko)",
    maxTokens: parseInt(process.env.MODEL_DEEP_MAX_TOKENS) || 4096,
  },
};

export const TASK_TIER_MAP = {
  faq: "cheap",
  classify_signal: "cheap",
  quick_summary: "balanced",
  market_insight: "balanced",
  trade_reasoning: "deep",
  risk_narrative: "deep",
};

export function resolveModel(taskType) {
  const tier = TASK_TIER_MAP[taskType] || "balanced";
  return MODELS[tier];
}
