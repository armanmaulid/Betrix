import { injectable } from "tsyringe";
import { ChatCompleted } from "@domain/events/index.js";
import { logChat, logTokenUsage, logMetrics, logUserActivity } from "@domain/services/index.js";

@injectable()
export class ChatLoggingHandler {
  async handle(event: ChatCompleted): Promise<void> {
    const { payload } = event;
    const { userId, sessionId, taskType, modelUsed, message, reply, latencyMs, usage } = payload;

    // We use Promise.allSettled to ensure one failing log doesn't block the others.
    await Promise.allSettled([
      logMetrics({
        type: "chat_completion", // We simplify to chat_completion for both since they represent the same outcome
        taskType,
        modelUsed,
        latencyMs,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        userId,
      }).catch(err => console.error("[ChatLoggingHandler] logMetrics failed:", err)),

      usage ? logTokenUsage({
        userId,
        taskType,
        modelUsed,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        latencyMs,
      }).catch(err => console.error("[ChatLoggingHandler] logTokenUsage failed:", err)) : Promise.resolve(),

      logChat({
        userId,
        sessionId: sessionId ?? null,
        taskType,
        modelUsed,
        message,
        reply,
        latencyMs,
        usage: usage ?? null,
      }).catch(err => console.error("[ChatLoggingHandler] logChat failed:", err)),

      logUserActivity({
        userId,
        action: "chat_message",
        details: { model: modelUsed, taskType },
        ip: "unknown",
        userAgent: "unknown",
      }).catch(err => console.error("[ChatLoggingHandler] logUserActivity failed:", err)),
    ]);
  }
}
