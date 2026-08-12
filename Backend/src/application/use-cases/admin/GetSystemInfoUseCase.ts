import { inject, injectable } from "tsyringe";
import { AnalyticsRepository } from "@domain/repositories/AnalyticsRepository.js";

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
  constructor(@inject("AnalyticsRepository") private analyticsRepo: AnalyticsRepository) {}

  async execute(): Promise<GetSystemInfoOutput> {
    const dbStats = await this.analyticsRepo.getSystemDatabaseStats();
    const redisInfo = await this.analyticsRepo.getRedisStats();

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
        size: dbStats.sizeFormatted,
        tables: dbStats.tables,
      },
      redis: redisInfo,
    };
  }
}