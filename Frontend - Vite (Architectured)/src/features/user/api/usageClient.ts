const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

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
