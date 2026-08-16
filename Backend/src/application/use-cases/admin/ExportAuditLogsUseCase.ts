import { inject, injectable } from "tsyringe";
import { AdminActionRepository } from "@domain/repositories/AdminActionRepository.js";
import { AdminActionType } from "@domain/entities/AdminAction.js";
import { escapeCsvField } from "@core/utils/csv.js";

interface ExportAuditLogsInput {
  format: "json" | "csv";
  search?: string;
  action?: AdminActionType;
  actorType?: "admin" | "user";
  actor?: string;
  from?: Date;
  to?: Date;
}

interface ExportAuditLogsOutput {
  data: string;
  contentType: string;
  filename: string;
}

@injectable()
export class ExportAuditLogsUseCase {
  constructor(
    @inject("AdminActionRepository") private adminActionRepo: AdminActionRepository
  ) {}

  async execute(input: ExportAuditLogsInput): Promise<ExportAuditLogsOutput> {
    const result = await this.adminActionRepo.findAll({
      page: 1,
      limit: 10000,
      search: input.search,
      action: input.action,
      actorType: input.actorType,
      actor: input.actor,
      from: input.from,
      to: input.to,
      order: "DESC",
    });

    const actions = result.actions.map(a => ({
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
      admin: { email: a.actorEmail ?? "", name: a.actorName ?? null },
      timestamp: a.createdAt,
    }));

    const dateStr = new Date().toISOString().split("T")[0];

    if (input.format === "json") {
      return {
        data: JSON.stringify({
          exportDate: new Date().toISOString(),
          filters: { search: input.search || "", action: input.action || "" },
          count: actions.length,
          actions,
        }, null, 2),
        contentType: "application/json",
        filename: `audit-trail-${dateStr}.json`,
      };
    }

    const csvRows = [
      "Timestamp,Actor,Actor Email,Actor Type,Action,Target Type,Target,Target ID,Details",
      ...actions.map(a => {
        const target = a.targetEmail || a.targetName || "";
        const detailStr = a.details ? JSON.stringify(a.details) : "";
        return [
          escapeCsvField(a.timestamp?.toISOString() || ""),
          escapeCsvField(a.admin.name || ""),
          escapeCsvField(a.admin.email),
          escapeCsvField(a.actorType),
          escapeCsvField(a.action),
          escapeCsvField(a.targetType || ""),
          escapeCsvField(target),
          escapeCsvField(a.targetId || ""),
          escapeCsvField(detailStr),
        ].join(",");
      }),
    ];

    return {
      data: csvRows.join("\n"),
      contentType: "text/csv",
      filename: `audit-trail-${dateStr}.csv`,
    };
  }
}