export interface SystemMetrics {
  totalUsers: number;
  activeSessions: number;
  totalMessages: number;
  totalTokens: number;
  uptime: number;
}

export interface DbStats {
  sizeMb: number;
  activeConnections: number;
}

export interface UserDetailStats {
  totalChats: number;
  totalTokens: number;
  totalRequests: number;
}

export interface RecentActivity {
  taskType: string;
  model: string;
  tokens: number;
  latency: number | null;
  timestamp: Date;
}

export interface AnalyticsQuery {
  days?: number;
  fromDate?: Date;
  toDate?: Date;
}

export interface DashboardMetrics {
  users: { total: number; newLast7Days: number; activeLast24h: number; banned: number; };
  chats: { total: number; last24h: number; };
  tokens: { allTime: number; last24h: number; };
  performance: { avgLatencyMs: number; };
}

export interface SystemDatabaseStats {
  sizeFormatted: string;
  tables: { users: number; chats: number; tokenUsage: number; };
}

export interface AnalyticsRepository {
  getSystemMetrics(): Promise<SystemMetrics>;
  getDbStats(): Promise<DbStats>;
  getDashboardMetrics(): Promise<DashboardMetrics>;
  getSystemDatabaseStats(): Promise<SystemDatabaseStats>;
  getRedisStats(): Promise<{ status: string; keys: number }>;
  getUserGrowth(query: AnalyticsQuery): Promise<{ date: string; newUsers: number }[]>;
  getTokenTrend(query: AnalyticsQuery): Promise<{ date: string; requests: number; totalTokens: number; avgLatency: number | null }[]>;
  getChatByTaskType(query: AnalyticsQuery): Promise<{ taskType: string; count: number }[]>;
  getModelDistribution(query: AnalyticsQuery): Promise<{ model: string; requests: number; totalTokens: number }[]>;
  getUserDetailStats(userId: string): Promise<UserDetailStats>;
  getUserRecentActivity(userId: string, limit: number): Promise<RecentActivity[]>;
}
