const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Talks to the local Python bridge (see /mt5-bridge) which reads live
// candle data straight from a running MT5 terminal — no third-party
// market-data API in the loop. Only works while the bridge + MT5 terminal
// are running on your machine (see mt5-bridge/README.md).
const candleCache = new Map<string, { data: Candle[], timestamp: number }>();

export async function fetchCandles(symbol: string, timeframe: string, count = 200, signal?: AbortSignal): Promise<Candle[]> {
  const cacheKey = `${symbol}_${timeframe}_${count}`;
  const cached = candleCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 30000) {
    return cached.data;
  }

  const url = `${BACKEND_URL}/api/market/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&count=${count}`;
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
    throw new Error(body?.detail || `MT5 bridge error (${res.status})`);
  }
  
  const data = await res.json();
  candleCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
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
  const res = await fetch(`${BACKEND_URL}/api/market/symbols`, { headers });
  
  if (!res.ok) {
     return [];
  }
  const data = await res.json();
  symbolsCache.data = data.symbols || [];
  symbolsCache.timestamp = Date.now();
  return symbolsCache.data;
}

export interface CalendarEvent {
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
const calendarCache = { data: null as CalendarResponse | null, timestamp: 0 };

export async function fetchEconomicCalendar(forceRefresh = false): Promise<CalendarResponse> {
  if (!forceRefresh && calendarCache.data && Date.now() - calendarCache.timestamp < 60000) {
    return calendarCache.data;
  }

  const token = localStorage.getItem("eaconsole.sessionToken");
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${BACKEND_URL}/api/market/economic-calendar`, { headers });
  if (res.status === 401) {
    localStorage.removeItem("eaconsole.sessionToken");
    window.location.href = "/login";
    throw new Error("Sesi kadaluarsa, silakan login kembali.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || `MT5 bridge error (${res.status})`);
  }
  
  const data = await res.json();
  calendarCache.data = data;
  calendarCache.timestamp = Date.now();
  return data;
}
