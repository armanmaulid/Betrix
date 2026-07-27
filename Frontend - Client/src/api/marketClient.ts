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
export async function fetchCandles(symbol: string, timeframe: string, count = 200): Promise<Candle[]> {
  const url = `${BACKEND_URL}/api/market/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&count=${count}`;
  const token = localStorage.getItem("eaconsole.sessionToken");
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || `MT5 bridge error (${res.status})`);
  }
  return res.json();
}

export interface BridgeHealth {
  connected: boolean;
  account: number | null;
  broker: string | null;
}

export async function checkBridgeHealth(): Promise<BridgeHealth> {
  // Removed health check because we are not using MT5 bridge anymore
  return { connected: true, account: 12345, broker: "Yahoo Finance API" };
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
export async function fetchEconomicCalendar(): Promise<CalendarResponse> {
  const token = localStorage.getItem("eaconsole.sessionToken");
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${BACKEND_URL}/api/market/economic-calendar`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || `MT5 bridge error (${res.status})`);
  }
  return res.json();
}
