import { pgClient } from "@data/orm/pgClient.js";

export interface UserActivityLogInput {
  userId: string;
  action: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export async function logUserActivity(input: UserActivityLogInput): Promise<void> {
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

export async function logAdminAction(input: {
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
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

export interface ChatLogInput {
  userId: string;
  sessionId: string | null;
  taskType: string;
  modelUsed: string;
  message: string;
  reply: string;
  latencyMs: number | null;
  usage: { inputTokens: number; outputTokens: number } | null;
}

export async function logChat(input: ChatLogInput): Promise<void> {
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

export interface TokenUsageInput {
  userId: string;
  taskType: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export async function logTokenUsage(input: TokenUsageInput): Promise<void> {
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

export interface MetricsLogInput {
  type: string;
  taskType: string;
  modelUsed: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  userId: string;
}

export async function logMetrics(input: MetricsLogInput): Promise<void> {
  // Log to console/logger for monitoring
  console.log(`[METRICS] ${input.type}:`, {
    taskType: input.taskType,
    model: input.modelUsed,
    latency: input.latencyMs,
    userId: input.userId,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
  });
}