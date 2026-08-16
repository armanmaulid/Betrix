import { injectable } from "tsyringe";
import { pgClient } from "../orm/pgClient.js";
import { AdminActionRepository } from "@domain/repositories/AdminActionRepository.js";
import { AdminAction, AdminActionType } from "@domain/entities/AdminAction.js";

interface AdminActionRow {
  id: string;
  admin_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
  actor_type: string;
  actor_email: string | null;
  actor_name: string | null;
  target_email: string | null;
  target_name: string | null;
}

@injectable()
export class PgAdminActionRepository implements AdminActionRepository {
  async save(action: AdminAction): Promise<AdminAction> {
    const { rows } = await pgClient.query(
      `INSERT INTO admin_actions (id, admin_id, action, target_type, target_id, details, ip, user_agent, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        action.id, action.adminId, action.action, action.targetType,
        action.targetId, action.details ? JSON.stringify(action.details) : null,
        action.ip, action.userAgent, action.createdAt
      ]
    );
    return this.mapRow(rows[0]);
  }

  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    action?: AdminActionType;
    actorType?: "admin" | "user";
    actor?: string;
    from?: Date;
    to?: Date;
    order: "ASC" | "DESC";
  }): Promise<{ actions: AdminAction[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.actorType) {
      conditions.push(`CASE WHEN u.is_admin THEN 'admin' ELSE 'user' END = $${paramIndex}`);
      values.push(params.actorType);
      paramIndex++;
    }

    if (params.search) {
      conditions.push(`(
        a.action ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex}
        OR COALESCE(tu.email, '') ILIKE $${paramIndex} OR COALESCE(tu.name, '') ILIKE $${paramIndex}
        OR COALESCE(a.details::text, '') ILIKE $${paramIndex}
      )`);
      values.push(`%${params.search}%`);
      paramIndex++;
    }

    if (params.action) {
      conditions.push(`a.action = $${paramIndex}`);
      values.push(params.action);
      paramIndex++;
    }

    if (params.actor) {
      conditions.push(`(u.email ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex})`);
      values.push(`%${params.actor}%`);
      paramIndex++;
    }

    if (params.from) {
      conditions.push(`a.created_at >= $${paramIndex}::date`);
      values.push(params.from);
      paramIndex++;
    }

    if (params.to) {
      conditions.push(`a.created_at < ($${paramIndex}::date + interval '1 day')`);
      values.push(params.to);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
    const fromClause = `
      FROM (
        SELECT
          a.id, a.action, a.target_type, a.target_id, a.details, a.created_at,
          CASE WHEN u.is_admin THEN 'admin' ELSE 'user' END AS actor_type,
          u.email AS actor_email, u.name AS actor_name,
          tu.email AS target_email, tu.name AS target_name,
          a.ip, a.user_agent
        FROM admin_actions a
        JOIN users u ON a.admin_id = u.id
        LEFT JOIN users tu ON a.target_type = 'user' AND a.target_id::uuid = tu.id
      ) audit
    `;

    const countQuery = `SELECT COUNT(*) ${fromClause}${whereClause}`;
    const { rows: countRows } = await pgClient.query(countQuery, values);
    const total = parseInt(countRows[0].count);

    values.push(params.limit, (params.page - 1) * params.limit);
    const query = `
      SELECT
        id, action, target_type, target_id, details, created_at,
        actor_type, actor_email, actor_name, target_email, target_name,
        ip, user_agent
      ${fromClause}${whereClause}
      ORDER BY created_at ${params.order}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const { rows } = await pgClient.query(query, values);
    return { actions: rows.map(this.mapRow), total };
  }

  async getActionTypes(): Promise<string[]> {
    const { rows } = await pgClient.query(
      `SELECT action FROM admin_actions UNION SELECT action FROM user_activity_logs ORDER BY action`
    );
    return rows.map(r => r.action);
  }

  private mapRow(row: AdminActionRow): AdminAction {
    return new AdminAction(
      row.id, row.admin_id, row.action as AdminActionType,
      row.target_type, row.target_id, row.details,
      row.ip, row.user_agent, row.created_at,
      row.actor_type as "admin" | "user",
      row.actor_email, row.actor_name, row.target_email, row.target_name
    );
  }
}