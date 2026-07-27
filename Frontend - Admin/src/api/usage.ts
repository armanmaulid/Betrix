import { apiClient } from "./client";

export interface GlobalUsageResponse {
  period: string;
  summary: {
    totalRequests: number;
    activeUsers: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    avgLatencyMs: number;
    firstRequest: string | null;
    lastRequest: string | null;
  };
  byTaskType: Array<{ taskType: string; requestCount: number; totalTokens: number; uniqueUsers: number }>;
  byModel: Array<{ model: string; requestCount: number; totalTokens: number }>;
  dailyTrend: Array<{ date: string; requestCount: number; activeUsers: number; totalTokens: number }>;
  topUsers: Array<{ userId: string; email: string; requestCount: number; totalTokens: number }>;
}

export async function fetchGlobalUsage(days = 30): Promise<GlobalUsageResponse> {
  const { data } = await apiClient.get<GlobalUsageResponse>("/usage/stats", {
    params: { days },
  });
  return data;
}
