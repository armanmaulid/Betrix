import { injectable } from "tsyringe";
import { pgClient } from "../orm/pgClient.js";
import {
  ActivityLogRepository,
  UserActivityLogInput,
  AdminActionLogInput,
  ChatLogInput,
  TokenUsageInput,
  MetricsLogInput
} from "@domain/repositories/ActivityLogRepository.js";
import { logger } from "@core/logging/logger.js";

@injectable()
export class PgActivityLogRepository implements ActivityLogRepository {
  async logUserActivity(input: UserActivityLogInput): Promise<void> {
    await pgClient.query(
      `INSERT INTO user_activity_logs (user_id, action, details, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.userId,
        input.action,
        input.details ? JSON.stringify(input.details) : null,
        input.ip ?? null,
        input.userAgent ?? null,
      ]
    );
  }

  async logAdminAction(input: AdminActionLogInput): Promise<void> {
    await pgClient.query(
      `INSERT INTO admin_actions (admin_id, action, target_type, target_id, details, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.adminId,
        input.action,
        input.targetType ?? null,
        input.targetId ?? null,
        input.details ? JSON.stringify(input.details) : null,
        input.ip ?? null,
        input.userAgent ?? null,
      ]
    );
  }

  async logChat(input: ChatLogInput): Promise<void> {
    await pgClient.query(
      `INSERT INTO chat_logs (user_id, session_id, task_type, model_used, message, reply, latency_ms, input_tokens, output_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.userId,
        input.sessionId,
        input.taskType,
        input.modelUsed,
        input.message,
        input.reply,
        input.latencyMs,
        input.usage?.inputTokens ?? 0,
        input.usage?.outputTokens ?? 0,
      ]
    );
  }

  async logTokenUsage(input: TokenUsageInput): Promise<void> {
    await pgClient.query(
      `INSERT INTO token_usage (user_id, task_type, model_used, input_tokens, output_tokens, total_tokens, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.userId,
        input.taskType,
        input.modelUsed,
        input.inputTokens,
        input.outputTokens,
        input.inputTokens + input.outputTokens,
        input.latencyMs,
      ]
    );
  }

  async logMetrics(input: MetricsLogInput): Promise<void> {
    logger.info(`[METRICS] ${input.type}`, {
      taskType: input.taskType,
      model: input.modelUsed,
      latency: input.latencyMs,
      userId: input.userId,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
    });
  }

  // Hanya user_activity_logs — admin_actions sengaja TIDAK di-delete (audit trail compliance).
  async cleanupOlderThan(days: number): Promise<number> {
    const { rowCount } = await pgClient.query(
      `DELETE FROM user_activity_logs WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      [days]
    );
    return rowCount || 0;
  }
}
