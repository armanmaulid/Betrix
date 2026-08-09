import { inject, injectable } from "tsyringe";
import { pgClient } from "@data/orm/pgClient.js";

interface GetUsageInput {
  userId: string;
  days: number;
}

interface GetUsageOutput {
  period: string;
  summary: {
    requestCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    avgLatencyMs: number;
    firstRequest: Date | null;
    lastRequest: Date | null;
  };
  byTaskType: Array<{ taskType: string; requestCount: number; totalTokens: number }>;
  dailyUsage: Array<{ date: string; requestCount: number; totalTokens: number }>;
}

@injectable()
export class GetUsageUseCase {
  async execute(input: GetUsageInput): Promise<GetUsageOutput> {
    const { rows: summary } = await pgClient.query(
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
      [input.userId, input.days]
    );

    const { rows: byTaskType } = await pgClient.query(
      `SELECT task_type, COUNT(*) as request_count, SUM(total_tokens) as total_tokens
       FROM token_usage
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY task_type
       ORDER BY total_tokens DESC`,
      [input.userId, input.days]
    );

    const { rows: dailyUsage } = await pgClient.query(
      `SELECT DATE(created_at) as date, COUNT(*) as request_count, SUM(total_tokens) as total_tokens
       FROM token_usage
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [input.userId, input.days]
    );

    const s = summary[0];

    return {
      period: `Last ${input.days} days`,
      summary: {
        requestCount: parseInt(s.request_count),
        totalInputTokens: parseInt(s.total_input_tokens),
        totalOutputTokens: parseInt(s.total_output_tokens),
        totalTokens: parseInt(s.total_tokens),
        avgLatencyMs: s.avg_latency_ms,
        firstRequest: s.first_request,
        lastRequest: s.last_request,
      },
      byTaskType: byTaskType.map(t => ({
        taskType: t.task_type,
        requestCount: parseInt(t.request_count),
        totalTokens: parseInt(t.total_tokens),
      })),
      dailyUsage: dailyUsage.map(d => ({
        date: d.date,
        requestCount: parseInt(d.request_count),
        totalTokens: parseInt(d.total_tokens),
      })),
    };
  }
}