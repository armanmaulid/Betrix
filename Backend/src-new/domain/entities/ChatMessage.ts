export enum ChatTaskType {
  GENERAL = "general",
  TRADE_REASONING = "trade_reasoning",
  RISK_NARRATIVE = "risk_narrative",
  MARKET_INSIGHT = "market_insight",
  QUICK_SUMMARY = "quick_summary",
  CLASSIFY_SIGNAL = "classify_signal",
}

export enum ModelTier {
  CHEAP = "cheap",
  BALANCED = "balanced",
  DEEP = "deep",
}

export class ChatMessage {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly sessionId: string | null,
    public readonly taskType: ChatTaskType,
    public readonly modelUsed: string,
    public readonly message: string,
    public readonly reply: string,
    public readonly latencyMs: number | null,
    public readonly inputTokens: number,
    public readonly outputTokens: number,
    public readonly createdAt: Date
  ) {}

  get totalTokens(): number {
    return this.inputTokens + this.outputTokens;
  }
}