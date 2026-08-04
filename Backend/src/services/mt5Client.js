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

// FIX (CPU spike di MT5 setelah reconnect): dulu trackedSymbols itu Set
// yang cuma nambah terus seumur hidup proses, nggak pernah ada yang
// ngurangin - meskipun SSE stream-nya sudah lama disconnect atau symbol-nya
// cuma sekali diminta lewat endpoint quote/candle. Efeknya, begitu WS ke
// MT5 reconnect (restart EA dsb), sendTrackRequest() ngirim ULANG seluruh
// daftar yang sudah menggembung itu sekaligus - dan EA jadi nge-loop
// SEMUA symbol itu tiap 20ms selamanya (SendCurrentPrices), bukan cuma
// symbol yang benar-benar sedang dipakai user.
//
// Sekarang tracking pakai Map<symbol, {refCount, lastTouched}>:
// - refCount > 0  -> ada SSE stream aktif yang butuh symbol ini, jangan disweep.
// - refCount == 0 -> cuma "disentuh" sekali (quote/candle one-off), boleh
//                    di-sweep otomatis kalau nggak disentuh lagi dalam SYMBOL_TTL_MS.
const trackedSymbols = new Map();
const SYMBOL_TTL_MS = 60 * 60 * 1000;      // symbol yang cuma di-quote sekali, dianggap basi setelah 1 jam nggak disentuh lagi
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;  // cek stale entries tiap 10 menit
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
      body: JSON.stringify({ symbols: Array.from(trackedSymbols.keys()) })
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

// Buang symbol yang refCount-nya 0 (nggak ada SSE stream aktif) DAN sudah
// nggak disentuh selama SYMBOL_TTL_MS. Kalau ada yang ke-drop, kirim ulang
// daftar yang sudah dipangkas ke EA supaya sinkron.
function sweepStaleSymbols() {
  const now = Date.now();
  let removedAny = false;
  for (const [symbol, entry] of trackedSymbols.entries()) {
    if (entry.refCount <= 0 && now - entry.lastTouched > SYMBOL_TTL_MS) {
      trackedSymbols.delete(symbol);
      removedAny = true;
    }
  }
  if (removedAny) {
    logger.debug(`Pruned stale symbols, ${trackedSymbols.size} remaining`, { context: "MT5" });
    sendTrackRequest();
  }
}
setInterval(sweepStaleSymbols, SWEEP_INTERVAL_MS).unref?.();

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

// Dipakai untuk one-off request (GET quote/candle) yang cuma mau "pastikan
// symbol ini di-stream", TANPA klaim kepemilikan jangka panjang - refCount
// TETAP 0, jadi kalau nggak ada yang nyentuh lagi dalam SYMBOL_TTL_MS bakal
// otomatis di-sweep.
export async function subscribeToSymbol(symbol) {
  if (!symbol) return;
  const isNew = !trackedSymbols.has(symbol);
  if (isNew) {
    trackedSymbols.set(symbol, { refCount: 0, lastTouched: Date.now() });
  } else {
    trackedSymbols.get(symbol).lastTouched = Date.now();
  }
  if (isNew) await sendTrackRequest();
}

// Subscribe beberapa simbol sekaligus DENGAN klaim kepemilikan (refCount++)
// — dipakai SSE stream (market.js) yang punya lifecycle jelas (connect →
// close), supaya pasangannya (unsubscribeFromSymbols) tau kapan symbol
// sudah nggak dibutuhkan siapa-siapa lagi.
export async function subscribeToSymbols(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) return;
  let addedAny = false;
  for (const s of symbols) {
    if (!s) continue;
    const entry = trackedSymbols.get(s);
    if (entry) {
      entry.refCount += 1;
      entry.lastTouched = Date.now();
    } else {
      trackedSymbols.set(s, { refCount: 1, lastTouched: Date.now() });
      addedAny = true;
    }
  }
  if (addedAny) await sendTrackRequest();
}

// Pasangan subscribeToSymbols — panggil ini pas SSE stream close. Cuma
// nurunin refCount, TIDAK langsung hapus dari trackedSymbols (biar kalau
// user reconnect cepat/refresh halaman, nggak bolak-balik subscribe ke EA).
// Penghapusan beneran terjadi lewat sweepStaleSymbols() kalau memang idle
// lama (refCount 0 selama SYMBOL_TTL_MS).
export function unsubscribeFromSymbols(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) return;
  for (const s of symbols) {
    const entry = trackedSymbols.get(s);
    if (entry) entry.refCount = Math.max(0, entry.refCount - 1);
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
