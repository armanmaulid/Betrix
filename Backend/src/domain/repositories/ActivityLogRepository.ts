export interface UserActivityLogInput {
  userId: string;
  action: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export interface AdminActionLogInput {
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
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

export interface TokenUsageInput {
  userId: string;
  taskType: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
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

export interface ActivityLogRepository {
  logUserActivity(input: UserActivityLogInput): Promise<void>;
  logAdminAction(input: AdminActionLogInput): Promise<void>;
  logChat(input: ChatLogInput): Promise<void>;
  logTokenUsage(input: TokenUsageInput): Promise<void>;
  logMetrics(input: MetricsLogInput): Promise<void>;
}
