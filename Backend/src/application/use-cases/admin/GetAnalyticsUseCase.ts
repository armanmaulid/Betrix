import { inject, injectable } from "tsyringe";
import { AnalyticsRepository } from "@domain/repositories/AnalyticsRepository.js";

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
  constructor(@inject("AnalyticsRepository") private analyticsRepo: AnalyticsRepository) {}

  async execute(input: GetAnalyticsInput): Promise<GetAnalyticsOutput> {
    const userGrowth = await this.analyticsRepo.getUserGrowth(input);
    const tokenTrend = await this.analyticsRepo.getTokenTrend(input);
    const chatByTaskType = await this.analyticsRepo.getChatByTaskType(input);
    const modelDistribution = await this.analyticsRepo.getModelDistribution(input);

    const days = Math.min(Math.max(input.days || 30, 1), 365);

    const periodLabel = input.fromDate && input.toDate
      ? `${input.fromDate.toISOString().split("T")[0]} to ${input.toDate.toISOString().split("T")[0]}`
      : `Last ${days} days`;

    return {
      period: periodLabel,
      userGrowth,
      tokenTrend,
      chatByTaskType,
      modelDistribution,
    };
  }
}