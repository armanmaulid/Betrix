import { inject, injectable } from "tsyringe";
import { AnalyticsRepository } from "@domain/repositories/AnalyticsRepository.js";

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
  constructor(@inject("AnalyticsRepository") private analyticsRepo: AnalyticsRepository) {}

  async execute(_input: GetMetricsInput): Promise<GetMetricsOutput> {
    return this.analyticsRepo.getDashboardMetrics();
  }
}