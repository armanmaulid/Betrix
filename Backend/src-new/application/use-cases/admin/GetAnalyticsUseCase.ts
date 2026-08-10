import { inject, injectable } from "tsyringe";
import { pgClient } from "@data/orm/pgClient.js";

interface GetAnalyticsInput {
  days?: number;
  fromDate?: Date;
  toDate?: Date;
}

interface GetAnalyticsOutput {
  period: string;
  userGrowth: Array<{ date: string; newUsers: number }>;
  tokenTrend: Array<{ date: string; requests: number; totalTokens: number; avgLatency: number | null }>;
  chatByTaskType: Array<{ taskType: string; count: number }>;
  modelDistribution: Array<{ model: string; requests: number; totalTokens: number }>;
}

@injectable()
export class GetAnalyticsUseCase {
  async execute(input: GetAnalyticsInput): Promise<GetAnalyticsOutput> {
    let dateCondition: string;
    let params: unknown[] = [];
    let paramCount = 1;

    if (input.fromDate && input.toDate) {
      dateCondition = `created_at >= $${paramCount} AND created_at < $${paramCount + 1}`;
      params.push(input.fromDate.toISOString(), input.toDate.toISOString());
      paramCount += 2;
    } else {
      const days = Math.min(Math.max(input.days || 30, 1), 365);
      dateCondition = `created_at >= NOW() - INTERVAL '1 day' * $${paramCount}`;
      params.push(days);
      paramCount++;
    }

    const { rows: userGrowth } = await pgClient.query(
      `SELECT DATE(created_at) as date, COUNT(*) as new_users
       FROM users
       WHERE ${dateCondition.replace('created_at', 'users.created_at')}
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      params
    );

    const { rows: tokenTrend } = await pgClient.query(
      `SELECT DATE(created_at) as date, COUNT(*) as requests, SUM(total_tokens) as total_tokens, AVG(latency_ms)::INTEGER as avg_latency
       FROM token_usage
       WHERE ${dateCondition}
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      params
    );

    const { rows: chatByTaskType } = await pgClient.query(
      `SELECT task_type, COUNT(*) as count
       FROM chat_logs
       WHERE ${dateCondition}
       GROUP BY task_type
       ORDER BY count DESC`,
      params
    );

    const { rows: modelDistribution } = await pgClient.query(
      `SELECT model_used, COUNT(*) as requests, SUM(total_tokens) as total_tokens
       FROM token_usage
       WHERE ${dateCondition}
       GROUP BY model_used
       ORDER BY total_tokens DESC`,
      params
    );

    const periodLabel = input.fromDate && input.toDate
      ? `${input.fromDate.toISOString().split("T")[0]} to ${input.toDate.toISOString().split("T")[0]}`
      : `Last ${params[0]} days`;

    return {
      period: periodLabel,
      userGrowth: userGrowth.map(row => ({ date: row.date, newUsers: parseInt(row.new_users) })),
      tokenTrend: tokenTrend.map(row => ({
        date: row.date,
        requests: parseInt(row.requests),
        totalTokens: parseInt(row.total_tokens),
        avgLatency: row.avg_latency,
      })),
      chatByTaskType: chatByTaskType.map(row => ({ taskType: row.task_type, count: parseInt(row.count) })),
      modelDistribution: modelDistribution.map(row => ({ model: row.model_used, requests: parseInt(row.requests), totalTokens: parseInt(row.total_tokens) })),
    };
  }
}