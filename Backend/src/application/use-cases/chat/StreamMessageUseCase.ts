import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { ChatRepository } from "@domain/repositories/ChatRepository.js";
import { CreditRepository } from "@domain/repositories/CreditRepository.js";
import { AiPort } from "@domain/ports";
import { CachePort } from "@domain/ports";
import { ChatTaskType, ModelTier } from "@domain/entities/ChatMessage.js";
import { CreditAction } from "@domain/entities/CreditTransaction.js";
import { InsufficientCreditsError, InternalError } from "@core/errors/index.js";
import { ModelPolicy } from "@domain/services/ModelPolicy.js";
import { sanitizeHistory } from "@core/utils/chat.js";
import { EventDispatcher, ChatCompleted } from "@domain/events/index.js";
import { AiPromptRegistry } from "@domain/services/AiPromptRegistry.js";
import { TradeAnalysisContextService } from "@application/services/TradeAnalysisContextService.js";
import type { ContextParams } from "@application/dtos/chat.dto.js";

interface StreamMessageInput {
  userId: string;
  taskType: ChatTaskType;
  message: string;
  displayMessage?: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  sessionId?: string;
  tier?: ModelTier;
  image?: string;
  contextParams?: ContextParams;
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
    @inject("CachePort") private cachePort: CachePort,
    @inject("EventDispatcher") private eventDispatcher: EventDispatcher,
    @inject("AiPromptRegistry") private promptRegistry: AiPromptRegistry,
    @inject("ModelPolicy") private modelPolicy: ModelPolicy,
    @inject("TradeAnalysisContextService") private contextService: TradeAnalysisContextService
  ) {}

  async execute(input: StreamMessageInput): Promise<StreamMessageOutput> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new InternalError("User not found");
    }

    const tier = this.modelPolicy.resolveTier(input.taskType, input.tier);
    const model = this.modelPolicy.resolveModel(input.taskType, tier);
    const cost = ModelPolicy.TIER_CREDIT_COST[tier];

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

    const contextBlock = await this.contextService.buildContext(input.contextParams);
    const userContent = contextBlock
      ? `${contextBlock}\n\n[PERMINTAAN USER]\n${input.message}`
      : input.message;

    const messages = [...cleanHistory, { role: "user" as const, content: userContent }];

    const systemPrompt = this.promptRegistry.getSystemPrompt(input.taskType);

    const startedAt = Date.now();
    try {
      const result = await this.aiPort.streamModel({
        model: model.id,
        maxTokens: model.maxTokens,
        system: systemPrompt,
        messages,
        onToken: input.onToken,
        signal: input.signal,
      });
      const latencyMs = Date.now() - startedAt;

      // Primary operation succeeded - tokens already streamed to client
      // Fire-and-forget logging via Domain Events
      this.eventDispatcher.dispatch(
        new ChatCompleted({
          userId: user.id,
          sessionId: input.sessionId,
          taskType: input.taskType,
          modelUsed: model.id,
          message: input.displayMessage || input.message,
          reply: result.text,
          latencyMs,
          usage: result.usage,
        })
      );

      return {
        reply: result.text,
        modelUsed: model.id,
        latencyMs,
        usage: result.usage ?? null,
      };
    } catch {
      // Only refund if AI call itself failed
      if (creditsDeducted) {
        await this.creditRepo.add(user.id, cost, `refund_chat_${tier}` as CreditAction);
      }
      throw new InternalError("Failed to stream AI model");
    }
  }
}