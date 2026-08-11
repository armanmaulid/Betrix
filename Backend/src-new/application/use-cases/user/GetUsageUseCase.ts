import { inject, injectable } from "tsyringe";
import { UsageRepository } from "@domain/repositories/UsageRepository.js";

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
  constructor(
    @inject("UsageRepository") private usageRepo: UsageRepository
  ) {}

  async execute(input: GetUsageInput): Promise<GetUsageOutput> {
    const s = await this.usageRepo.getSummary(input.userId, input.days);
    const byTaskType = await this.usageRepo.getByTaskType(input.userId, input.days);
    const dailyUsage = await this.usageRepo.getDailyUsage(input.userId, input.days);

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