import { pgClient } from "@data/orm/pgClient.js";
import { UserActivityLog } from "@domain/entities/UserActivityLog.js";

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