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

const symbolsCache = { data: [] as BrokerSymbol[], timestamp: 0 };

export async function fetchBrokerSymbols(): Promise<BrokerSymbol[]> {
  if (symbolsCache.data.length > 0 && Date.now() - symbolsCache.timestamp < 300000) {
    return symbolsCache.data;
  }

  const token = localStorage.getItem("eaconsole.sessionToken");
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${BACKEND_URL}/api/v1/market/symbols`, { headers });
  
  if (!res.ok) {
     return [];
  }
  const data = await res.json();
  symbolsCache.data = data.symbols || [];
  symbolsCache.timestamp = Date.now();
  return symbolsCache.data;
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

// Reads the JSON file written by CalendarExporter.mq5 (an EA attached to a
// chart in your MT5 terminal — see mt5-bridge/CalendarExporter.mq5 for why
// this needs a separate EA instead of just another bridge endpoint: the
// Calendar functions only exist in MQL5 running inside the terminal, not
// in the external Python API).
const calendarCache = new Map<string, { data: CalendarResponse; timestamp: number }>();

export async function fetchEconomicCalendar(
  fromDate: string, // "YYYY-MM-DD"
  toDate: string, // "YYYY-MM-DD"
  forceRefresh = false
): Promise<CalendarResponse> {
  const cacheKey = `${fromDate}_${toDate}`;
  const cached = calendarCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < 60000) {
    return cached.data;
  }

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

  const data = { generatedAt: new Date().toISOString(), events: mapped };
  calendarCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}
