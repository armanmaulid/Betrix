import { BACKEND_URL } from "../../../shared/lib/config";
import { emitSessionExpired } from "../../../shared/lib/authEvents";

export interface BrokerSymbol {
  symbol: string;
  description: string;
  category: string;
  path: string;
  trade_mode: number;
}

export async function fetchBrokerSymbols(): Promise<BrokerSymbol[]> {
  const token = localStorage.getItem("eaconsole.sessionToken");
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${BACKEND_URL}/api/v1/market/symbols`, { headers });
  
  if (!res.ok) {
     return [];
  }
  const data = await res.json();
  return data.symbols || [];
}

export interface CalendarEvent {
  eventId: number;
  time: string; // ISO 8601, trade server time
  country: string; // ISO alpha-2, e.g. "US", "EU"
  currency: string;
  event: string;
  importance: "high" | "medium" | "low" | "none";
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

export interface CalendarResponse {
  generatedAt: string;
  events: CalendarEvent[];
}

export async function fetchEconomicCalendar(
  fromDate: string, // "YYYY-MM-DD"
  toDate: string, // "YYYY-MM-DD"
  signal?: AbortSignal,
): Promise<CalendarResponse> {
  const token = localStorage.getItem("eaconsole.sessionToken");
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const params = new URLSearchParams({ fromDate, toDate });
  const res = await fetch(`${BACKEND_URL}/api/v1/market/calendar?${params}`, { headers, signal });

  if (res.status === 401) {
    emitSessionExpired();
    throw new Error("Sesi kadaluarsa, silakan login kembali.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `HTTP ${res.status}`);
  }

  const { events } = await res.json();
  const mapped: CalendarEvent[] = events.map((e: any) => ({
    eventId: e.eventId,
    time: e.eventTime,
    country: e.country,
    currency: e.currency,
    event: e.eventName,
    importance: e.importance,
    actual: e.actual,
    forecast: e.forecast,
    previous: e.previous,
  }));

  return { generatedAt: new Date().toISOString(), events: mapped };
}
