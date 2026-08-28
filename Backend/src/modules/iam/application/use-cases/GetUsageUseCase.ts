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
        requestCount: Number(s.request_count),
        totalInputTokens: Number(s.total_input_tokens),
        totalOutputTokens: Number(s.total_output_tokens),
        totalTokens: Number(s.total_tokens),
        avgLatencyMs: Number(s.avg_latency_ms ?? 0),
        firstRequest: s.first_request instanceof Date ? s.first_request : s.first_request ? new Date(s.first_request) : null,
        lastRequest: s.last_request instanceof Date ? s.last_request : s.last_request ? new Date(s.last_request) : null,
      },
      byTaskType: byTaskType.map(t => ({
        taskType: t.task_type,
        requestCount: Number(t.request_count),
        totalTokens: Number(t.total_tokens ?? 0),
      })),
      dailyUsage: dailyUsage.map(d => ({
        date: d.date instanceof Date ? d.date.toISOString().slice(0, 10) : String(d.date),
        requestCount: Number(d.request_count),
        totalTokens: Number(d.total_tokens ?? 0),
      })),
    };
  }
}