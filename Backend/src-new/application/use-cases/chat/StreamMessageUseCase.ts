import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { ChatRepository } from "@domain/repositories/ChatRepository.js";
import { CreditRepository } from "@domain/repositories/CreditRepository.js";
import { AiPort } from "@application/ports";
import { CachePort } from "@application/ports";
import { ChatTaskType, ModelTier } from "@domain/entities/ChatMessage.js";
import { CreditAction } from "@domain/entities/CreditTransaction.js";
import { User } from "@domain/entities/User.js";
import { ValidationError, InsufficientCreditsError, InternalError } from "@core/errors/index.js";
import { resolveModel, TIER_CREDIT_COST, TASK_TIER_MAP } from "@config/models.js";
import { logChat, logTokenUsage, logMetrics, logUserActivity } from "@domain/services/index.js";
import { LIMITS } from "@core/constants/index.js";
import { sanitizeHistory } from "@core/utils/chat.js";

interface StreamMessageInput {
  userId: string;
  taskType: ChatTaskType;
  message: string;
  displayMessage?: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  sessionId?: string;
  tier?: ModelTier;
  image?: string;
  onToken: (token: string) => void;
  signal?: AbortSignal;
}

interface StreamMessageOutput {
  reply: string;
  modelUsed: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number } | null;
}

@injectable()
export class StreamMessageUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("ChatRepository") private chatRepo: ChatRepository,
    @inject("CreditRepository") private creditRepo: CreditRepository,
    @inject("AiPort") private aiPort: AiPort,
    @inject("CachePort") private cachePort: CachePort
  ) {}

  async execute(input: StreamMessageInput): Promise<StreamMessageOutput> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new InternalError("User not found");
    }

    const tier = input.tier || TASK_TIER_MAP[input.taskType] || "balanced";
    const model = resolveModel(input.taskType, tier);
    const cost = TIER_CREDIT_COST[tier];

    let creditsDeducted = false;
    try {
      await this.creditRepo.deduct(user.id, cost, `chat_${tier}` as CreditAction);
      creditsDeducted = true;
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message === "Insufficient credits") {
        throw new InsufficientCreditsError();
      }
      throw err;
    }

    const cleanHistory = sanitizeHistory(input.history);
    const messages = [...cleanHistory, { role: "user" as const, content: input.message.substring(0, LIMITS.MESSAGE_MAX_LENGTH) }];

    const systemPrompt = this.getSystemPrompt(input.taskType);

    try {
      const result = await this.aiPort.streamModel({
        model: model.id,
        maxTokens: model.maxTokens,
        system: systemPrompt,
        messages,
        onToken: input.onToken,
        signal: input.signal,
      });

      // Primary operation succeeded - tokens already streamed to client
      // Fire-and-forget logging side effects - don't let them affect the response
      this.fireAndForgetLogging({
        user,
        input,
        result,
        model,
        cost,
        tier,
      });

      return {
        reply: result.text,
        modelUsed: model.id,
        latencyMs: 0,
        usage: result.usage ?? null,
      };
    } catch (err) {
      // Only refund if AI call itself failed (not logging failures)
      if (creditsDeducted) {
        await this.creditRepo.add(user.id, cost, `refund_chat_${tier}` as CreditAction);
      }
      throw new InternalError("Failed to stream AI model");
    }
  }

  private fireAndForgetLogging(params: {
    user: User;
    input: StreamMessageInput;
    result: { text: string; usage?: { inputTokens: number; outputTokens: number } };
    model: { id: string; maxTokens: number };
    cost: number;
    tier: string;
  }): void {
    const { user, input, result, model, cost, tier } = params;

    // Use Promise.allSettled to ensure all logging completes independently
    Promise.allSettled([
      logMetrics({
        type: "chat_stream",
        taskType: input.taskType,
        modelUsed: model.id,
        latencyMs: 0,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        userId: user.id,
      }).catch(err => console.error("logMetrics failed:", err)),

      result.usage ? logTokenUsage({
        userId: user.id,
        taskType: input.taskType,
        modelUsed: model.id,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs: 0,
      }).catch(err => console.error("logTokenUsage failed:", err)) : Promise.resolve(),

      logChat({
        userId: user.id,
        sessionId: input.sessionId ?? null,
        taskType: input.taskType,
        modelUsed: model.id,
        message: input.displayMessage || input.message,
        reply: result.text,
        latencyMs: 0,
        usage: result.usage ?? null,
      }).catch(err => console.error("logChat failed:", err)),

      logUserActivity({
        userId: user.id,
        action: "chat_message",
        details: { model: model.id, taskType: input.taskType },
        ip: "unknown",
        userAgent: "unknown",
      }).catch(err => console.error("logUserActivity failed:", err)),
    ]).then(() => {
      // Logging complete
    });
  }

  private getSystemPrompt(taskType: ChatTaskType): string {
    const prompts: Record<ChatTaskType, string> = {
      general: "You are a general processor for a forex trading platform. Answer concisely and accurately about trading terms, indicators, or basic forex concepts.",
      trade_reasoning: "You are an analysis engine for a Forex Expert Advisor. Explain the reasoning behind a trading signal/decision in a structured way (market conditions, relevant indicators, support/resistance levels). Never guarantee future price movements.",
      risk_narrative: "You are a risk management calculator for forex positions. Explain risks honestly and balanced - lot size, stop loss, exposure, potential drawdown - without exaggerating or minimizing.",
      market_insight: "You are a forex market data processor. Provide brief data-driven insights based on given data (price, indicators, trading session). Avoid certain claims about future price direction.",
      quick_summary: "Summarize the following information (news/trading log) concisely and clearly.",
      classify_signal: "Classify the following trading signal into exactly one of: BUY, SELL, HOLD, or NO_ACTION. Respond with only the category label.",
    };
    return prompts[taskType] || prompts.general;
  }
}