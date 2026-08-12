const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export async function fetchUserCredits(): Promise<number> {
  const token = localStorage.getItem("eaconsole.sessionToken");
  if (!token) return 0;

  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/usage/current-month`, {
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
    const res = await fetch(`${BACKEND_URL}/api/v1/usage/me?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!res.ok) return null;
    
    return await res.json();
  } catch (err) {
    console.error("Gagal mengambil data usage", err);
    return null;
  }
}


