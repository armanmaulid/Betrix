const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export async function fetchUserCredits(): Promise<number> {
  const token = localStorage.getItem("eaconsole.sessionToken");
  if (!token) return 0;

  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/me/usage/current-month`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!res.ok) return 0;
    
    const data = await res.json();
    return data.credits ?? data.totalTokens ?? 0;
  } catch (err) {
    console.error("Gagal mengambil data credits", err);
    return 0;
  }
}

export interface DailyUsage {
  date: string;
  requestCount: number;
  totalTokens: number;
}

export interface UsageSummary {
  period: string;
  summary: {
    requestCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    avgLatencyMs: number;
    firstRequest: string | null;
    lastRequest: string | null;
  };
  byTaskType: Array<{ taskType: string, requestCount: number, totalTokens: number }>;
  dailyUsage: DailyUsage[];
}

export async function fetchUsageMe(days: number = 30): Promise<UsageSummary | null> {
  const token = localStorage.getItem("eaconsole.sessionToken");
  if (!token) return null;

  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/me/usage/me?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!res.ok) return null;
    
    return await res.json();
  } catch (err) {
    console.error("Gagal mengambil data usage", err);
    return null;
  }
}

export interface Message {
  id: string;
  subject: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  threadId: string;
  from: {
    id: string | null;
    email: string;
    name: string;
  };
  to: {
    id: string;
    email: string;
    name: string;
  };
}

export interface GetMessagesParams {
  limit?: number;
  offset?: number;
  unread?: boolean;
  search?: string;
}

export async function getMessages(params: GetMessagesParams = {}): Promise<Message[]> {
  const token = localStorage.getItem("eaconsole.sessionToken");
  if (!token) return [];

  const queryParams = new URLSearchParams();
  if (params.limit !== undefined) queryParams.append("limit", params.limit.toString());
  if (params.offset !== undefined) queryParams.append("offset", params.offset.toString());
  if (params.unread !== undefined) queryParams.append("unread", params.unread.toString());
  if (params.search !== undefined) queryParams.append("search", params.search);

  const query = queryParams.toString();
  const url = `${BACKEND_URL}/api/v1/me/messages${query ? `?${query}` : ""}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    // Token expired/invalid
    return [];
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch messages: ${res.status}`);
  }

  return res.json();
}

export interface SendMessageData {
  toEmail: string;
  subject: string;
  body: string;
  replyToMessageId?: string;
}

export async function sendMessage(data: SendMessageData): Promise<{ id: string }> {
  const token = localStorage.getItem("eaconsole.sessionToken");
  if (!token) throw new Error("No session token");

  const res = await fetch(`${BACKEND_URL}/api/v1/me/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (res.status === 401) {
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to send message: ${res.status}`);
  }

  return res.json();
}
