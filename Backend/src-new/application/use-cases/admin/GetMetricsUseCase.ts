import { inject, injectable } from "tsyringe";
import { pgClient } from "@data/orm/pgClient.js";
import { redisClient } from "@data/orm/redisClient.js";

interface GetMetricsInput {
  days: number;
}

interface GetMetricsOutput {
  users: {
    total: number;
    newLast7Days: number;
    activeLast24h: number;
    banned: number;
  };
  chats: {
    total: number;
    last24h: number;
  };
  tokens: {
    allTime: number;
    last24h: number;
  };
  performance: {
    avgLatencyMs: number;
  };
}

@injectable()
export class GetMetricsUseCase {
  async execute(input: GetMetricsInput): Promise<GetMetricsOutput> {
    const { rows: metrics } = await pgClient.query(`
      SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days') as new_users_7d,
        (SELECT COUNT(*) FROM users WHERE last_active >= NOW() - INTERVAL '24 hours') as active_users_24h,
        (SELECT COUNT(*) FROM users WHERE status = 'banned') as banned_users,
        (SELECT COUNT(*) FROM chat_logs) as total_chats,
        (SELECT COUNT(*) FROM chat_logs WHERE created_at >= NOW() - INTERVAL '24 hours') as chats_24h,
        (SELECT COALESCE(SUM(total_tokens), 0) FROM token_usage) as total_tokens_all_time,
        (SELECT COALESCE(SUM(total_tokens), 0) FROM token_usage WHERE created_at >= NOW() - INTERVAL '24 hours') as tokens_24h,
        (SELECT COALESCE(AVG(latency_ms), 0)::INTEGER FROM token_usage WHERE created_at >= NOW() - INTERVAL '24 hours') as avg_latency_24h
    `);

    const m = metrics[0];

    return {
      users: {
        total: parseInt(m.total_users),
        newLast7Days: parseInt(m.new_users_7d),
        activeLast24h: parseInt(m.active_users_24h),
        banned: parseInt(m.banned_users),
      },
      chats: {
        total: parseInt(m.total_chats),
        last24h: parseInt(m.chats_24h),
      },
      tokens: {
        allTime: parseInt(m.total_tokens_all_time),
        last24h: parseInt(m.tokens_24h),
      },
      performance: {
        avgLatencyMs: m.avg_latency_24h,
      },
    };
  }
}