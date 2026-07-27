export interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  status: "active" | "banned" | "suspended";
  emailVerified: boolean;
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  status: "active" | "banned" | "suspended";
  emailVerified: boolean;
  createdAt: string;
  lastActive: string | null;
  stats: {
    totalChats: number;
    totalTokens: number;
  };
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface UsersListResponse {
  users: AdminUserRow[];
  pagination: PaginationInfo;
}

export interface UserDetailResponse {
  user: {
    id: string;
    email: string;
    name: string;
    isAdmin: boolean;
    status: "active" | "banned" | "suspended";
    emailVerified: boolean;
    verifiedAt: string | null;
    createdAt: string;
    lastActive: string | null;
  };
  stats: {
    totalChats: number;
    totalTokens: number;
    totalRequests: number;
  };
  recentActivity: Array<{
    taskType: string;
    model: string;
    tokens: number;
    latency: number | null;
    timestamp: string;
  }>;
}

export interface UserChatEntry {
  id: string;
  taskType: string;
  message: string;
  reply: string;
  model: string;
  latency: number | null;
  timestamp: string;
}

export interface MetricsResponse {
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

export interface AnalyticsResponse {
  period: string;
  userGrowth: Array<{ date: string; newUsers: number }>;
  tokenTrend: Array<{
    date: string;
    requests: number;
    totalTokens: number;
    avgLatency: number | null;
  }>;
  chatByTaskType: Array<{ taskType: string; count: number }>;
  modelDistribution: Array<{
    model: string;
    requests: number;
    totalTokens: number;
  }>;
}

export interface SystemResponse {
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
  redis: { status: string; keys?: number; uptime?: string; error?: string };
}

export interface LogEntry {
  message?: string;
  timestamp?: string;
  level?: string;
  [key: string]: unknown;
}

export interface LogsResponse {
  type: string;
  count: number;
  logs: LogEntry[];
  message?: string;
}

export interface AdminAction {
  id: string;
  action: string;
  actorType: "admin" | "user";
  targetType: string | null;
  targetId: string | null;
  targetEmail: string | null;
  targetName: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  admin: { email: string; name: string };
  timestamp: string;
}

export interface ActionsResponse {
  actions: AdminAction[];
  pagination: PaginationInfo;
}

export interface AuditLogParams {
  page?: number;
  limit?: number;
  search?: string;
  action?: string;
  actor?: string;
  actorType?: "admin" | "user" | "";
  from?: string;
  to?: string;
  order?: "ASC" | "DESC";
}
