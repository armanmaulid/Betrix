import { pgClient } from "@data/orm/pgClient.js";
import type { UsageRepository, UsageSummaryRow, UsageTaskTypeRow, UsageDailyRow } from "@domain/repositories/UsageRepository.js";

export class PgUsageRepository implements UsageRepository {
  async cleanupOlderThan(days: number): Promise<number> {
    const { rowCount } = await pgClient.query(
      `DELETE FROM token_usage WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      [days]
    );
    return rowCount || 0;
  }

  async getSummary(userId: string, days: number): Promise<UsageSummaryRow> {
    const { rows } = await pgClient.query(
      `SELECT
        COUNT(*) as request_count,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(AVG(latency_ms), 0) as avg_latency_ms,
        MIN(created_at) as first_request,
        MAX(created_at) as last_request
       FROM token_usage
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2`,
      [userId, days]
    );
    return rows[0];
  }

  async getByTaskType(userId: string, days: number): Promise<UsageTaskTypeRow[]> {
    const { rows } = await pgClient.query(
      `SELECT task_type, COUNT(*) as request_count, SUM(total_tokens) as total_tokens
       FROM token_usage
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY task_type
       ORDER BY total_tokens DESC`,
      [userId, days]
    );
    return rows;
  }

  async getDailyUsage(userId: string, days: number): Promise<UsageDailyRow[]> {
    const { rows } = await pgClient.query(
      `SELECT DATE(created_at) as date, COUNT(*) as request_count, SUM(total_tokens) as total_tokens
       FROM token_usage
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [userId, days]
    );
    return rows;
  }
}
