import { injectable } from "tsyringe";
import { pgClient } from "../orm/pgClient.js";
import { redisClient } from "../orm/redisClient.js";
import { AnalyticsRepository, SystemMetrics, DbStats, UserDetailStats, RecentActivity, AnalyticsQuery } from "@domain/repositories/AnalyticsRepository.js";

@injectable()
export class PgAnalyticsRepository implements AnalyticsRepository {
  async getRedisStats(): Promise<{ status: string; keys: number }> {
    try {
      await redisClient.ping();
      const dbKeys = await redisClient.dbsize();
      return { status: "connected", keys: dbKeys };
    } catch {
      return { status: "error", keys: 0 };
    }
  }
  async getSystemMetrics(): Promise<SystemMetrics> {
    const { rows: metrics } = await pgClient.query(`
      SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM sessions WHERE expires_at > NOW()) as active_sessions,
        (SELECT COUNT(*) FROM messages) as total_messages,
        (SELECT COALESCE(SUM(total_tokens), 0) FROM token_usage) as total_tokens
    `);
    
    return {
      totalUsers: parseInt(metrics[0].total_users),
      activeSessions: parseInt(metrics[0].active_sessions),
      totalMessages: parseInt(metrics[0].total_messages),
      totalTokens: parseInt(metrics[0].total_tokens),
      uptime: process.uptime(),
    };
  }

  async getDbStats(): Promise<DbStats> {
    const { rows: dbStats } = await pgClient.query(`
      SELECT
        pg_database_size(current_database()) / 1024 / 1024 as size_mb,
        (SELECT count(*) FROM pg_stat_activity) as active_connections
    `);
    return {
      sizeMb: parseFloat(dbStats[0].size_mb),
      activeConnections: parseInt(dbStats[0].active_connections),
    };
  }

  async getDashboardMetrics(): Promise<import("@domain/repositories/AnalyticsRepository.js").DashboardMetrics> {
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
      users: { total: parseInt(m.total_users), newLast7Days: parseInt(m.new_users_7d), activeLast24h: parseInt(m.active_users_24h), banned: parseInt(m.banned_users) },
      chats: { total: parseInt(m.total_chats), last24h: parseInt(m.chats_24h) },
      tokens: { allTime: parseInt(m.total_tokens_all_time), last24h: parseInt(m.tokens_24h) },
      performance: { avgLatencyMs: m.avg_latency_24h || 0 },
    };
  }

  async getSystemDatabaseStats(): Promise<import("@domain/repositories/AnalyticsRepository.js").SystemDatabaseStats> {
    const { rows: dbStats } = await pgClient.query(`
      SELECT
        (SELECT COUNT(*) FROM users) as users_count,
        (SELECT COUNT(*) FROM chat_logs) as chats_count,
        (SELECT COUNT(*) FROM token_usage) as token_usage_count,
        (SELECT pg_size_pretty(pg_database_size(current_database()))) as db_size
    `);
    return {
      sizeFormatted: dbStats[0].db_size,
      tables: {
        users: parseInt(dbStats[0].users_count),
        chats: parseInt(dbStats[0].chats_count),
        tokenUsage: parseInt(dbStats[0].token_usage_count),
      },
    };
  }

  private buildDateCondition(query: AnalyticsQuery, tableAlias: string = ""): { condition: string; params: unknown[] } {
    let condition: string;
    const params: unknown[] = [];
    const col = tableAlias ? `${tableAlias}.created_at` : "created_at";

    if (query.fromDate && query.toDate) {
      condition = `${col} >= $1 AND ${col} < $2`;
      params.push(query.fromDate.toISOString(), query.toDate.toISOString());
    } else {
      const days = Math.min(Math.max(query.days || 30, 1), 365);
      condition = `${col} >= NOW() - INTERVAL '1 day' * $1`;
      params.push(days);
    }
    return { condition, params };
  }

  async getUserGrowth(query: AnalyticsQuery): Promise<{ date: string; newUsers: number }[]> {
    const { condition, params } = this.buildDateCondition(query, "users");
    const { rows } = await pgClient.query(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM users
       WHERE ${condition}
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      params
    );
    return rows.map(r => ({ date: r.date, newUsers: parseInt(r.count) }));
  }

  async getTokenTrend(query: AnalyticsQuery): Promise<{ date: string; requests: number; totalTokens: number; avgLatency: number | null }[]> {
    const { condition, params } = this.buildDateCondition(query);
    const { rows } = await pgClient.query(
      `SELECT DATE(created_at) as date, COUNT(*) as requests, SUM(total_tokens) as total_tokens, AVG(latency_ms)::INTEGER as avg_latency
       FROM token_usage
       WHERE ${condition}
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      params
    );
    return rows.map(r => ({ date: r.date, requests: parseInt(r.requests), totalTokens: parseInt(r.total_tokens || "0"), avgLatency: r.avg_latency }));
  }

  async getChatByTaskType(query: AnalyticsQuery): Promise<{ taskType: string; count: number }[]> {
    const { condition, params } = this.buildDateCondition(query);
    const { rows } = await pgClient.query(
      `SELECT task_type, COUNT(*) as count
       FROM chat_logs
       WHERE ${condition}
       GROUP BY task_type
       ORDER BY count DESC`,
      params
    );
    return rows.map(r => ({ taskType: r.task_type, count: parseInt(r.count) }));
  }

  async getModelDistribution(query: AnalyticsQuery): Promise<{ model: string; requests: number; totalTokens: number }[]> {
    const { condition, params } = this.buildDateCondition(query);
    const { rows } = await pgClient.query(
      `SELECT model_used as model, COUNT(*) as requests, SUM(total_tokens) as total_tokens
       FROM token_usage
       WHERE ${condition}
       GROUP BY model_used
       ORDER BY total_tokens DESC`,
      params
    );
    return rows.map(r => ({ model: r.model, requests: parseInt(r.requests), totalTokens: parseInt(r.total_tokens || "0") }));
  }

  async getUserDetailStats(userId: string): Promise<UserDetailStats> {
    const { rows } = await pgClient.query(
      `SELECT
        (SELECT COUNT(*) FROM chat_logs WHERE user_id = $1) as total_chats,
        (SELECT COALESCE(SUM(total_tokens), 0) FROM token_usage WHERE user_id = $1) as total_tokens,
        (SELECT COUNT(*) FROM token_usage WHERE user_id = $1) as total_requests
      `,
      [userId]
    );
    return {
      totalChats: parseInt(rows[0].total_chats),
      totalTokens: parseInt(rows[0].total_tokens),
      totalRequests: parseInt(rows[0].total_requests),
    };
  }

  async getUserRecentActivity(userId: string, limit: number): Promise<RecentActivity[]> {
    const { rows } = await pgClient.query(
      `SELECT task_type, model_used, total_tokens, latency_ms, created_at
       FROM token_usage
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return rows.map(a => ({
      taskType: a.task_type,
      model: a.model_used,
      tokens: parseInt(a.total_tokens),
      latency: a.latency_ms,
      timestamp: a.created_at,
    }));
  }
}
