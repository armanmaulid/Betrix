import { inject, injectable } from "tsyringe";
import { randomUUID } from "crypto";
import { ChatCompleted } from "@domain/events/index.js";
import { ActivityLogRepository } from "@domain/repositories/ActivityLogRepository.js";
import { ChatRepository } from "@domain/repositories/ChatRepository.js";
import { ChatMessage } from "@domain/entities/ChatMessage.js";

@injectable()
export class ChatLoggingHandler {
  constructor(
    @inject("ActivityLogRepository") private activityLogRepo: ActivityLogRepository,
    @inject("ChatRepository") private chatRepo: ChatRepository
  ) {}

  async handle(event: ChatCompleted): Promise<void> {
    const { payload } = event;
    const { userId, sessionId, taskType, modelUsed, message, reply, latencyMs, usage } = payload;

    // Persist the chat turn to chat_logs via ChatRepository (read by /chat/history).
    // logMetrics / logTokenUsage / logUserActivity go to separate activity tables.
    // We use Promise.allSettled to ensure one failing log doesn't block the others.
    await Promise.allSettled([
      this.chatRepo.save(
        new ChatMessage(
          randomUUID(),
          userId,
          sessionId ?? null,
          taskType,
          modelUsed,
          message,
          reply,
          latencyMs,
          usage?.inputTokens ?? 0,
          usage?.outputTokens ?? 0,
          new Date()
        )
      ).catch(err => console.error("[ChatLoggingHandler] chatRepo.save failed:", err)),

      this.activityLogRepo.logMetrics({
        type: "chat_completion",
        taskType,
        modelUsed,
        latencyMs,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        userId,
      }).catch(err => console.error("[ChatLoggingHandler] logMetrics failed:", err)),

      usage ? this.activityLogRepo.logTokenUsage({
        userId,
        taskType,
        modelUsed,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        latencyMs,
      }).catch(err => console.error("[ChatLoggingHandler] logTokenUsage failed:", err)) : Promise.resolve(),

      this.activityLogRepo.logUserActivity({
        userId,
        action: "chat_message",
        details: { model: modelUsed, taskType },
        ip: "unknown",
        userAgent: "unknown",
      }).catch(err => console.error("[ChatLoggingHandler] logUserActivity failed:", err)),
    ]);
  }
}
