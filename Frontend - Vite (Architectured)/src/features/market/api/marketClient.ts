const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}


export async function fetchOHLC(symbol: string, timeframe: string, signal?: AbortSignal) {
  const url = `${BACKEND_URL}/api/v1/market/ohlc/${encodeURIComponent(symbol)}/${timeframe}`;
  const token = localStorage.getItem("eaconsole.sessionToken");
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  
  const res = await fetch(url, { headers, signal });
  if (res.status === 401) {
    localStorage.removeItem("eaconsole.sessionToken");
    window.location.href = "/login";
    throw new Error("Sesi kadaluarsa, silakan login kembali.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  
  return await res.json();
}


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
): Promise<CalendarResponse> {
  const token = localStorage.getItem("eaconsole.sessionToken");
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const params = new URLSearchParams({ fromDate, toDate, limit: "500" });
  const res = await fetch(`${BACKEND_URL}/api/v1/market/calendar?${params}`, { headers });

  if (res.status === 401) {
    localStorage.removeItem("eaconsole.sessionToken");
    window.location.href = "/login";
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
