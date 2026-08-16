import { inject, injectable } from "tsyringe";
import { AdminActionRepository } from "@domain/repositories/AdminActionRepository.js";
import { AdminActionType } from "@domain/entities/AdminAction.js";

interface GetAuditLogsInput {
  page: number;
  limit: number;
  search?: string;
  action?: AdminActionType;
  actorType?: "admin" | "user";
  actor?: string;
  from?: Date;
  to?: Date;
  order: "ASC" | "DESC";
}

interface GetAuditLogsOutput {
  actions: Array<{
    id: string;
    action: AdminActionType;
    actorType: "admin" | "user";
    targetType: string | null;
    targetId: string | null;
    targetEmail: string | null;
    targetName: string | null;
    details: Record<string, unknown> | null;
    ip: string | null;
    userAgent: string | null;
    admin: { email: string; name: string | null };
    timestamp: Date;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@injectable()
export class GetAuditLogsUseCase {
  constructor(
    @inject("AdminActionRepository") private adminActionRepo: AdminActionRepository
  ) {}

  async execute(input: GetAuditLogsInput): Promise<GetAuditLogsOutput> {
    const result = await this.adminActionRepo.findAll({
      page: input.page,
      limit: input.limit,
      search: input.search,
      action: input.action,
      actorType: input.actorType,
      actor: input.actor,
      from: input.from,
      to: input.to,
      order: input.order,
    });

    return {
      actions: result.actions.map(a => ({
        id: a.id,
        action: a.action,
        // Nilai nyata dari SQL (JOIN users di repo) — bukan tebakan action prefix.
        // Fallback "admin" hanya untuk row yang tidak punya data join (tidak terjadi dari findAll).
        actorType: a.actorType ?? "admin",
        targetType: a.targetType,
        targetId: a.targetId,
        targetEmail: a.targetEmail ?? null,
        targetName: a.targetName ?? null,
        details: a.details,
        ip: a.ip,
        userAgent: a.userAgent,
        admin: { email: a.actorEmail ?? "", name: a.actorName ?? null },
        timestamp: a.createdAt,
      })),
      pagination: {
        page: input.page,
        limit: input.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / input.limit),
      },
    };
  }
}