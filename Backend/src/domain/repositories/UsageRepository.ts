export interface UsageSummaryRow {
  request_count: string | number;
  total_input_tokens: string | number;
  total_output_tokens: string | number;
  total_tokens: string | number;
  avg_latency_ms: string | number | null;
  first_request: Date | string | null;
  last_request: Date | string | null;
}

export interface UsageTaskTypeRow {
  task_type: string;
  request_count: string | number;
  total_tokens: string | number | null;
}

export interface UsageDailyRow {
  date: Date | string;
  request_count: string | number;
  total_tokens: string | number | null;
}

export interface UsageRepository {
  cleanupOlderThan(days: number): Promise<number>;
  getSummary(userId: string, days: number): Promise<UsageSummaryRow>;
  getByTaskType(userId: string, days: number): Promise<UsageTaskTypeRow[]>;
  getDailyUsage(userId: string, days: number): Promise<UsageDailyRow[]>;
}
