import { AdminAction, AdminActionType } from "../entities/AdminAction.js";

export interface AdminActionRepository {
  save(action: AdminAction): Promise<AdminAction>;
  findAll(params: {
    page: number;
    limit: number;
    search?: string;
    action?: AdminActionType;
    actorType?: "admin" | "user";
    actor?: string;
    from?: Date;
    to?: Date;
    order: "ASC" | "DESC";
  }): Promise<{ actions: AdminAction[]; total: number }>;
  getActionTypes(): Promise<string[]>;
}