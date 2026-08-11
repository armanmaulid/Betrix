export interface UsageRepository {
  cleanupOlderThan(days: number): Promise<number>;
  getSummary(userId: string, days: number): Promise<any>;
  getByTaskType(userId: string, days: number): Promise<any[]>;
  getDailyUsage(userId: string, days: number): Promise<any[]>;
}
