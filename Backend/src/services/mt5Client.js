import WebSocket from "ws";
import { logger } from "../utils/logger.js";
import { upsertEvents } from "./calendarStore.js";

// WebSocket & HTTP URL ke MT5 Bridge EA.
// MT5_WS_URL contoh: "ws://127.0.0.1:8890" atau "wss://mt5.domain.com"
// MT5_HTTP_URL contoh: "http://127.0.0.1:8890" atau "https://mt5.domain.com"
const rawBridgeUrl = process.env.MT5_BRIDGE_URL || "127.0.0.1:8890";
const MT5_HTTP_BASE = process.env.MT5_HTTP_URL || (rawBridgeUrl.startsWith("http") ? rawBridgeUrl : `http://${rawBridgeUrl}`);
const MT5_WS_BASE = process.env.MT5_WS_URL || (rawBridgeUrl.startsWith("ws") ? rawBridgeUrl : `ws://${rawBridgeUrl}`);

export const latestPrices = {};

const trackedSymbols = new Set();
let wsConnection = null;

const priceListeners = new Set();

export function addPriceListener(fn) {
  priceListeners.add(fn);
}

export function removePriceListener(fn) {
  priceListeners.delete(fn);
}

// ─────────────────────────────────────────────────────────────────────────
// Economic calendar - live delta only (histori/seed sekarang urusan
// calendarStore.js + Postgres, lihat services/calendarStore.js). Di sini
// cuma nampung koneksi WebSocket buat delta real-time (event baru/actual
// value baru rilis), tulis-tembus ke DB, terus kasih tau listener SSE
// (routes/market.js) biar client bisa auto-refresh.
// ─────────────────────────────────────────────────────────────────────────

const calendarListeners = new Set();

export function addCalendarListener(fn) {
  calendarListeners.add(fn);
}

export function removeCalendarListener(fn) {
  calendarListeners.delete(fn);
}

async function sendTrackRequest() {
  if (trackedSymbols.size === 0) return;
  try {
    const res = await fetch(`${MT5_HTTP_BASE}/v1/track/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: Array.from(trackedSymbols) })
    });
    if (!res.ok) {
      logger.error(`Failed to update tracking symbols: ${res.status}`, { context: "MT5" });
    } else {
      logger.debug(`Successfully requested live tracking for ${trackedSymbols.size} symbols`, { context: "MT5" });
    }
  } catch (e) {
    logger.error(`Error sending track request: ${e.message}`, { context: "MT5" });
  }
}

async function sendTrackCalendarRequest() {
  try {
    const res = await fetch(`${MT5_HTTP_BASE}/v1/track/calendar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Sengaja tanpa filter - biar backend yang filter, EA cukup broadcast semua.
      body: JSON.stringify({ min_importance: "low" }),
    });
    if (!res.ok) {
      logger.error(`Failed to enable calendar tracking: ${res.status}`, { context: "MT5" });
    } else {
      logger.debug("Calendar streaming subscribed (all countries/currencies)", { context: "MT5" });
    }
  } catch (e) {
    logger.error(`Error sending track/calendar request: ${e.message}`, { context: "MT5" });
  }
}

// Subscribe 1 simbol — dipakai untuk call site yang memang cuma butuh 1
// simbol (misal SSE market.js saat client connect).
export async function subscribeToSymbol(symbol) {
  if (!symbol) return;
  trackedSymbols.add(symbol);
  await sendTrackRequest();
}

// Subscribe beberapa simbol sekaligus (batch) — misal TickerStrip yang
// butuh 12 simbol sekaligus pas mount. Kirim 1 HTTP request daripada 12
// request berurutan.
export async function subscribeToSymbols(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) return;
  let addedAny = false;
  for (const s of symbols) {
    if (s && !trackedSymbols.has(s)) {
      trackedSymbols.add(s);
      addedAny = true;
    }
  }
  if (addedAny) {
    await sendTrackRequest();
  }
}

export function initializeMt5Client() {
  let reconnectTimer;
  let reconnectAttempt = 0;

  function getBackoffDelay() {
    const base = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000);
    return base + Math.random() * 1000;
  }

  function connect() {
    // The MT5 EA upgrades the root endpoint to a WebSocket connection
    const wsUrl = MT5_WS_BASE.endsWith('/') ? MT5_WS_BASE : `${MT5_WS_BASE}/`;
    
    logger.info(`Connecting to MT5 WebSocket at ${wsUrl}...`, { context: "MT5" });
    wsConnection = new WebSocket(wsUrl);

    wsConnection.on("open", async () => {
      logger.info("Connected to WebSocket for Live Ticks", { context: "MT5" });
      reconnectAttempt = 0;
      
      // Tell the EA via HTTP POST which symbols we want to stream over this WebSocket
      await sendTrackRequest();

      // Histori/seed sekarang tanggung jawab calendarStore.syncCalendarIfNeeded()
      // yang dipanggil di server.js saat startup - di sini cukup subscribe
      // buat delta live-nya aja.
      await sendTrackCalendarRequest();
    });

    wsConnection.on("message", (data) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.type === "price_update" && payload.symbol) {
           const priceObj = {
             price: payload.bid, // Default reference
             bid: payload.bid,
             ask: payload.ask,
             timestamp: Date.now() // Use Node.js local timestamp to avoid timezone issues
           };
           
           const oldPrice = latestPrices[payload.symbol];
           if (!oldPrice || oldPrice.price !== priceObj.price) {
             latestPrices[payload.symbol] = priceObj;
             priceListeners.forEach(fn => fn(payload.symbol, priceObj));
           }
        } else if (payload.type === "calendar_update" && Array.isArray(payload.events)) {
           // Tulis-tembus ke Postgres (upsertEvents idempotent by value_id),
           // lalu kasih tau listener SSE - jangan blok pemrosesan pesan WS
           // berikutnya sambil nunggu query DB selesai.
           upsertEvents(payload.events)
             .then((saved) => {
               if (saved > 0) calendarListeners.forEach((fn) => fn(payload.events));
             })
             .catch((e) => logger.error(`Gagal simpan calendar_update ke DB: ${e.message}`, { context: "Calendar" }));
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    wsConnection.on("close", () => {
      const delay = getBackoffDelay();
      reconnectAttempt++;
      logger.warn(`Live Ticks connection lost. Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempt})...`, { context: "MT5" });
      wsConnection = null;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, delay);
    });

    wsConnection.on("error", (err) => {
      logger.error(`WebSocket Error: ${err.message}`, { context: "MT5" });
      if (wsConnection) wsConnection.close();
    });
  }

  connect();
}

// REST API Helper for OHLC History
export async function fetchMt5History(symbol, timeframe, fromDate, toDate) {
  const url = `${MT5_HTTP_BASE}/v1/history/prices?symbol=${encodeURIComponent(symbol)}&time_frame=${encodeURIComponent(timeframe)}&from_date=${fromDate}&to_date=${toDate}`;
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`MT5 Bridge responded with ${response.status}: ${errorText}`);
  }
  return await response.json();
}

// REST API Helper to get all available symbols from MT5
export async function fetchMt5Symbols() {
  const url = `${MT5_HTTP_BASE}/v1/symbol/list`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MT5 Bridge responded with ${response.status}`);
  }
  
  const text = await response.text();
  // Fix unescaped backslashes in JSON (MT5 EA bug where \ in paths are not escaped)
  const sanitizedText = text.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
  
  const json = JSON.parse(sanitizedText);
  return json.symbols || json;
}

// REST API Helper to get just the symbol count from MT5 (cheap, no full list build)
export async function fetchMt5SymbolCount() {
  const url = `${MT5_HTTP_BASE}/v1/symbol/count`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MT5 Bridge responded with ${response.status}`);
  }
  const json = await response.json();
  return json.count;
}
