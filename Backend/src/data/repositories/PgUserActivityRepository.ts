import { injectable } from "tsyringe";
import { pgClient } from "../orm/pgClient.js";
import { UserActivityRepository } from "@domain/repositories/UserActivityRepository.js";
import { UserActivity } from "@domain/entities/UserActivity.js";

@injectable()
export class PgUserActivityRepository implements UserActivityRepository {
  async findAll(params: {
    userId: string;
    page: number;
    limit: number;
    action?: string;
    from?: Date;
    to?: Date;
  }): Promise<{ activities: UserActivity[]; total: number }> {
    const conditions: string[] = ["user_id = $1"];
    const values: unknown[] = [params.userId];
    let paramIndex = 2;

    if (params.action) {
      conditions.push(`action = $${paramIndex}`);
      values.push(params.action);
      paramIndex++;
    }

    if (params.from) {
      conditions.push(`created_at >= $${paramIndex}::date`);
      values.push(params.from);
      paramIndex++;
    }

    if (params.to) {
      conditions.push(`created_at < ($${paramIndex}::date + interval '1 day')`);
      values.push(params.to);
      paramIndex++;
    }

    const whereClause = " WHERE " + conditions.join(" AND ");

    const countQuery = `SELECT COUNT(*) FROM user_activity_logs${whereClause}`;
    const { rows: countRows } = await pgClient.query(countQuery, values);
    const total = parseInt(countRows[0].count);

    values.push(params.limit, (params.page - 1) * params.limit);
    const query = `
      SELECT id, user_id, action, details, ip, user_agent, created_at
      FROM user_activity_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const { rows } = await pgClient.query(query, values);
    
    const activities = rows.map(r => new UserActivity(
      r.id, r.user_id, r.action, r.details, r.ip, r.user_agent, r.created_at
    ));

    return { activities, total };
  }
}
