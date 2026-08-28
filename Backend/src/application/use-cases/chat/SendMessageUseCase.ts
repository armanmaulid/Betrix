import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { ChatRepository } from "@domain/repositories/ChatRepository.js";
import { CreditRepository } from "@domain/repositories/CreditRepository.js";
import { AiPort, CachePort } from "@domain/ports";
import { ChatTaskType, ModelTier } from "@domain/entities/ChatMessage.js";
import { CreditAction } from "@domain/entities/CreditTransaction.js";
import { InsufficientCreditsError, InternalError } from "@core/errors/index.js";
import { ModelPolicy } from "@domain/services/ModelPolicy.js";
import { sanitizeHistory } from "@core/utils/chat.js";
import { EventDispatcher, ChatCompleted } from "@domain/events/index.js";
import { AiPromptRegistry } from "@domain/services/AiPromptRegistry.js";
import { TradeAnalysisContextService } from "@application/services/TradeAnalysisContextService.js";
import type { ContextParams } from "@application/dtos/chat.dto.js";

interface SendMessageInput {
  userId: string;
  taskType: ChatTaskType;
  message: string;
  displayMessage?: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  sessionId?: string;
  tier?: ModelTier;
  image?: string;
  contextParams?: ContextParams;
}

interface SendMessageOutput {
  reply: string;
  modelUsed: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number } | null;
}

@injectable()
export class SendMessageUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("ChatRepository") private chatRepo: ChatRepository,
    @inject("CreditRepository") private creditRepo: CreditRepository,
    @inject("AiPort") private aiPort: AiPort,
    @inject("CachePort") private cachePort: CachePort,
    @inject("EventDispatcher") private eventDispatcher: EventDispatcher,
    @inject("AiPromptRegistry") private promptRegistry: AiPromptRegistry,
    @inject("ModelPolicy") private modelPolicy: ModelPolicy,
    @inject("TradeAnalysisContextService") private contextService: TradeAnalysisContextService
  ) {}

  async execute(input: SendMessageInput): Promise<SendMessageOutput> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new InternalError("User not found");
    }

    const tier = this.modelPolicy.resolveTier(input.taskType, input.tier);
    const model = this.modelPolicy.resolveModel(input.taskType, tier);
    const cost = ModelPolicy.TIER_CREDIT_COST[tier];

    const cleanHistory = sanitizeHistory(input.history);

    const contextBlock = await this.contextService.buildContext(input.contextParams);
    const userContent = contextBlock
      ? `${contextBlock}\n\n[PERMINTAAN USER]\n${input.message}`
      : input.message;

    const messages = [...cleanHistory, { role: "user" as const, content: userContent }];

    const cacheKey = `${input.userId}:${input.message}`;
    const isCacheable = ["general", "quick_summary", "classify_signal"].includes(input.taskType) && messages.length === 1;

    // Check cache BEFORE deducting credits
    if (isCacheable) {
      const cached = this.cachePort.get(input.taskType, cacheKey);
      if (cached) {
        return {
          reply: cached.text,
          modelUsed: cached.modelUsed,
          latencyMs: 0,
          usage: cached.usage ?? null,
        };
      }
    }

    // Deduct credits only if not cached
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

    const systemPrompt = this.promptRegistry.getSystemPrompt(input.taskType);

    try {
      const result = await this.aiPort.callModel({
        model: model.id,
        maxTokens: model.maxTokens,
        system: systemPrompt,
        messages,
      });

      if (isCacheable) {
        this.cachePort.set(input.taskType, cacheKey, {
          text: result.text,
          modelUsed: model.id,
          usage: result.usage,
        });
      }

      // Primary operation succeeded
      // Fire-and-forget logging via Domain Events
      this.eventDispatcher.dispatch(
        new ChatCompleted({
          userId: user.id,
          sessionId: input.sessionId,
          taskType: input.taskType,
          modelUsed: model.id,
          message: input.displayMessage || input.message,
          reply: result.text,
          latencyMs: 0,
          usage: result.usage,
        })
      );

      return {
        reply: result.text,
        modelUsed: model.id,
        latencyMs: 0,
        usage: result.usage ?? null,
      };
    } catch {
      // Only refund if AI call itself failed
      if (creditsDeducted) {
        await this.creditRepo.add(user.id, cost, `refund_chat_${tier}` as CreditAction);
      }
      throw new InternalError("Failed to call AI model");
    }
  }
}