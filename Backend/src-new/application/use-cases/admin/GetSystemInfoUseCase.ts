import { inject, injectable } from "tsyringe";
import { pgClient } from "@data/orm/pgClient.js";
import { redisClient } from "@data/orm/redisClient.js";

interface GetSystemInfoOutput {
  server: {
    uptime: { seconds: number; formatted: string };
    memory: { rss: string; heapUsed: string; heapTotal: string };
    nodeVersion: string;
    platform: string;
  };
  database: {
    status: string;
    size: string;
    tables: { users: number; chats: number; tokenUsage: number };
  };
  redis: { status: string; keys: number };
}

@injectable()
export class GetSystemInfoUseCase {
  async execute(): Promise<GetSystemInfoOutput> {
    const { rows: dbStats } = await pgClient.query(`
      SELECT
        (SELECT COUNT(*) FROM users) as users_count,
        (SELECT COUNT(*) FROM chat_logs) as chats_count,
        (SELECT COUNT(*) FROM token_usage) as token_usage_count,
        (SELECT pg_size_pretty(pg_database_size(current_database()))) as db_size
    `);

    let redisInfo = { status: "unknown", keys: 0 };
    try {
      await redisClient.ping();
      const dbKeys = await redisClient.dbsize();
      redisInfo = { status: "connected", keys: dbKeys };
    } catch {
      redisInfo = { status: "error", keys: 0 };
    }

    const uptime = process.uptime();
    const uptimeHours = Math.floor(uptime / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);
    const memUsage = process.memoryUsage();

    return {
      server: {
        uptime: { seconds: Math.floor(uptime), formatted: `${uptimeHours}h ${uptimeMinutes}m` },
        memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024) + " MB",
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + " MB",
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + " MB",
        },
        nodeVersion: process.version,
        platform: process.platform,
      },
      database: {
        status: "connected",
        size: dbStats[0].db_size,
        tables: {
          users: parseInt(dbStats[0].users_count),
          chats: parseInt(dbStats[0].chats_count),
          tokenUsage: parseInt(dbStats[0].token_usage_count),
        },
      },
      redis: redisInfo,
    };
  }
}