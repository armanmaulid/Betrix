export enum AdminActionType {
  UPDATE_USER = "update_user",
  DELETE_USER = "delete_user",
  RESET_PASSWORD = "reset_password",
  EMAIL_CHANGED = "email_changed",
  EMAIL_CHANGE_REQUESTED = "email_change_requested",
  EXPORT_USERS = "export_users",
  BROADCAST_MESSAGE = "broadcast_message",
  EXPORT_AUDIT_LOG = "export_audit_log",
  UPDATE_PROFILE = "update_profile",
}

export class AdminAction {
  constructor(
    public readonly id: string,
    public readonly adminId: string,
    public readonly action: AdminActionType,
    public readonly targetType: string | null,
    public readonly targetId: string | null,
    public readonly details: Record<string, unknown> | null,
    public readonly ip: string | null,
    public readonly userAgent: string | null,
    public readonly createdAt: Date
  ) {}

  static create(data: {
    adminId: string;
    action: AdminActionType;
    targetType?: string | null;
    targetId?: string | null;
    details?: Record<string, unknown> | null;
    ip?: string | null;
    userAgent?: string | null;
  }): AdminAction {
    return new AdminAction(
      crypto.randomUUID(),
      data.adminId,
      data.action,
      data.targetType ?? null,
      data.targetId ?? null,
      data.details ?? null,
      data.ip ?? null,
      data.userAgent ?? null,
      new Date()
    );
  }
}