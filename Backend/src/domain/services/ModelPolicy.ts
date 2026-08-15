export type TaskType =
  | "general"
  | "classify_signal"
  | "quick_summary"
  | "market_insight"
  | "trade_reasoning"
  | "risk_narrative";

export type ModelTier = "cheap" | "balanced" | "deep";

export interface ModelDefinition {
  id: string;
  label: string;
  maxTokens: number;
}

/**
 * Kebijakan pemilihan model & biaya kredit — pure domain logic (Phase 5).
 *
 * Daftar model (id/label/maxTokens) tidak di-hardcode di sini: di-inject
 * dari env via container (bootstrap). Peta task → tier dan biaya kredit
 * adalah keputusan domain murni.
 */
export class ModelPolicy {
  static readonly TASK_TIER_MAP: Record<TaskType, ModelTier> = {
    general: "cheap",
    classify_signal: "cheap",
    quick_summary: "balanced",
    market_insight: "balanced",
    trade_reasoning: "deep",
    risk_narrative: "deep",
  };

  static readonly TIER_CREDIT_COST: Record<ModelTier, number> = {
    cheap: 1,
    balanced: 3,
    deep: 5,
  };

  constructor(private readonly models: Record<ModelTier, ModelDefinition>) {}

  resolveTier(taskType: string, tierOverride?: string): ModelTier {
    if (tierOverride && this.models[tierOverride as ModelTier]) {
      return tierOverride as ModelTier;
    }
    return ModelPolicy.TASK_TIER_MAP[taskType as TaskType] || "balanced";
  }

  resolveModel(taskType: string, tierOverride?: string): ModelDefinition {
    const tier = this.resolveTier(taskType, tierOverride);
    return this.models[tier];
  }

  creditCost(tier: ModelTier): number {
    return ModelPolicy.TIER_CREDIT_COST[tier];
  }
}
