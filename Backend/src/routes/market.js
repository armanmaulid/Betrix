import { Router } from "express";
import rateLimit from "express-rate-limit";
import { latestPrices, fetchMt5History, subscribeToSymbol, addPriceListener, removePriceListener } from "../services/mt5Client.js";
import { requireAuth } from "../middleware/auth.js";
import { validateSession } from "../services/sessionStore.js";
import { logger } from "../utils/logger.js";

const router = Router();
// In-memory cache untuk meminimalkan beban polling ke MT5
const marketCache = new Map();
const CACHE_TTL_MS = 2000; // 2 seconds default

const HARDCODED_SYMBOLS = [
  { symbol: "EURUSD", name: "Euro vs US Dollar", category: "Forex" },
  { symbol: "GBPUSD", name: "Great Britain Pound vs US Dollar", category: "Forex" },
  { symbol: "USDJPY", name: "US Dollar vs Japanese Yen", category: "Forex" },
  { symbol: "USDCHF", name: "US Dollar vs Swiss Franc", category: "Forex" },
  { symbol: "USDCAD", name: "US Dollar vs Canadian Dollar", category: "Forex" },
  { symbol: "AUDUSD", name: "Australian Dollar vs US Dollar", category: "Forex" },
  { symbol: "NZDUSD", name: "New Zealand Dollar vs US Dollar", category: "Forex" },
  { symbol: "XAUUSD", name: "Gold vs US Dollar", category: "Metals" },
  { symbol: "XAGUSD", name: "Silver vs US Dollar", category: "Metals" },
  { symbol: "XTIUSD", name: "WTI Crude Oil", category: "Commodities" },
  { symbol: "USOIL", name: "US Oil", category: "Commodities" },
  { symbol: "BTCUSD", name: "Bitcoin vs US Dollar", category: "Crypto" },
  { symbol: "ETHUSD", name: "Ethereum vs US Dollar", category: "Crypto" }
];

async function getMt5SymbolsCached() {
  return { count: HARDCODED_SYMBOLS.length, symbols: HARDCODED_SYMBOLS };
}

// Helper: Deteksi apakah simbol sedang libur akhir pekan
async function isMarketClosed(symbol) {
  try {
    const symbolsData = await getMt5SymbolsCached();
    const symInfo = symbolsData.symbols.find(s => s.symbol === symbol);
    if (symInfo && symInfo.category.toLowerCase().includes("crypto")) {
      return false; // Crypto buka 24/7
    }
  } catch (err) {
    // Fallback if fetch fails
  }

  const day = new Date().getUTCDay();
  // Return true jika Sabtu (6) atau Minggu (0)
  return day === 0 || day === 6;
}

// FIX (memory leak): sebelumnya marketCache tidak pernah di-evict — entry
// yang sudah lewat CACHE_TTL_MS (2 detik) cuma jadi "stale" tapi tetap
// nongkrong selamanya di Map (baru ke-overwrite kalau kombinasi
// symbol_interval_limit yang PERSIS SAMA diminta lagi). Kalau banyak
// symbol/timeframe/count berbeda dicoba dari waktu ke waktu, Map ini bisa
// terus membesar tanpa batas. Sweep berkala di bawah membuang entry yang
// jauh lebih tua dari TTL normalnya.
const CACHE_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 menit
const STALE_THRESHOLD_MS = 65 * 60 * 1000; // 65 menit (mendukung TTL 1 jam saat weekend)

const marketCacheSweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of marketCache.entries()) {
    if (now - entry.timestamp > STALE_THRESHOLD_MS) {
      marketCache.delete(key);
    }
  }
}, CACHE_SWEEP_INTERVAL_MS);
marketCacheSweepTimer.unref?.();

// ─────────────────────────────────────────────────────────────────────────
// FIX (auth): route market sebelumnya TIDAK PUNYA proteksi sama sekali —
// tidak requireAuth, dan sengaja dikecualikan dari rate limiter global di
// server.js. Karena data market ini cuma untuk user dashboard yang sudah
// login (bukan halaman publik), sekarang:
//   1. /stream diverifikasi lewat token di query param (EventSource browser
//      tidak bisa kirim header Authorization) — pola sama persis seperti
//      /api/news/stream yang sudah ada di codebase.
//   2. Route lain (candles/ticker/economic-calendar/symbols) pakai
//      requireAuth biasa + rate limiter khusus market di bawah.
//   3. /stream ditambah connection cap per user, karena vektor abuse yang
//      relevan untuk endpoint SSE bukan "request/menit" (itu cuma sekali
//      saat handshake), tapi jumlah koneksi bersamaan yang menumpuk di
//      priceListeners set (mt5Client.js) — tiap konekin nganggur tetap
//      dapat broadcast tiap price update, jadi kalau dibiarkan tak
//      terbatas, satu akun bisa bikin server kerja jauh lebih berat tanpa
//      pernah "melebihi rate limit".
// ─────────────────────────────────────────────────────────────────────────

const MAX_STREAMS_PER_USER = Number(process.env.MARKET_MAX_STREAMS_PER_USER) || 5;
const activeStreamsByUser = new Map(); // userId -> jumlah koneksi SSE aktif

router.get("/stream", async (req, res) => {
  const sessionToken = req.query.token;

  if (!sessionToken) {
    return res.status(401).json({ error: "Session token tidak ditemukan" });
  }

  let user;
  try {
    user = await validateSession(sessionToken);
  } catch (err) {
    logger.error("[GET /api/market/stream] gagal validasi session", { error: err.message });
    return res.status(503).json({ error: "Gagal validasi session, coba lagi sebentar" });
  }

  if (!user) {
    return res.status(401).json({ error: "Session tidak valid atau expired" });
  }

  const currentStreams = activeStreamsByUser.get(user.id) || 0;
  if (currentStreams >= MAX_STREAMS_PER_USER) {
    return res.status(429).json({ error: "Terlalu banyak koneksi stream aktif untuk akun ini" });
  }
  activeStreamsByUser.set(user.id, currentStreams + 1);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const { symbol } = req.query;
  const symbolsToTrack = symbol ? symbol.toUpperCase().split(",") : null;

  if (symbolsToTrack) {
    symbolsToTrack.forEach(s => subscribeToSymbol(s));
  }

  // Send initial data immediately
  res.write(`event: connected\ndata: ${JSON.stringify({ status: "connected" })}\n\n`);

  if (symbolsToTrack) {
    symbolsToTrack.forEach(s => {
      if (latestPrices[s]) {
        res.write(`event: price_update\ndata: ${JSON.stringify({ symbol: s, ...latestPrices[s] })}\n\n`);
      }
    });
  } else {
    // If no specific symbol requested, send all known prices as initial burst
    Object.keys(latestPrices).forEach(s => {
      res.write(`event: price_update\ndata: ${JSON.stringify({ symbol: s, ...latestPrices[s] })}\n\n`);
    });
  }

  const listener = (updatedSymbol, priceObj) => {
    if (!symbolsToTrack || symbolsToTrack.includes(updatedSymbol)) {
      res.write(`event: price_update\ndata: ${JSON.stringify({ symbol: updatedSymbol, ...priceObj })}\n\n`);
    }
  };

  addPriceListener(listener);

  req.on("close", () => {
    removePriceListener(listener);

    const remaining = (activeStreamsByUser.get(user.id) || 1) - 1;
    if (remaining <= 0) {
      activeStreamsByUser.delete(user.id);
    } else {
      activeStreamsByUser.set(user.id, remaining);
    }
  });
});

// Semua route di bawah ini wajib login.
router.use(requireAuth);

// Rate limit khusus market — lebih longgar dari limiter global (30/menit)
// karena chart/ticker biasa di-poll otomatis oleh frontend tiap beberapa
// detik. Di-key per user (bukan per IP) karena requireAuth sudah jalan.
const marketLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MARKET_PER_MINUTE) || 120,
  keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak request market data, coba lagi sebentar lagi" },
});
router.use(marketLimiter);

router.get("/candles", async (req, res) => {
  try {
    let { symbol, timeframe, count } = req.query;
    if (!symbol) return res.status(400).json({ detail: "Missing symbol" });

    // FIX (bug nyata): sebelumnya timeframe tidak divalidasi sama sekali —
    // `timeframe.toUpperCase()` di bawah akan throw TypeError kalau
    // timeframe tidak dikirim (undefined), ketangkep try/catch dan jadi
    // 500 generik "Gagal mengambil data dari Yahoo Finance" yang
    // menyesatkan (kelihatan seperti error Yahoo Finance padahal murni
    // input tidak divalidasi). Sekarang divalidasi eksplisit dengan 400.
    if (!timeframe) return res.status(400).json({ detail: "Missing timeframe" });

    count = parseInt(count) || 200;
    // FIX (boundary): count negatif (mis. -5) sebelumnya lolos begitu saja
    // -- `Math.min(-5, 1000)` = -5, lalu `candles.slice(-limit)` di bawah
    // jadi `slice(5)` dan diam-diam mengembalikan potongan yang salah,
    // bukan error yang jelas. Sekarang count di-clamp minimal 1.
    const limit = Math.min(Math.max(count, 1), 1000); // Batasi 1-1000 candle

    const mt5Symbol = symbol.toUpperCase();
    subscribeToSymbol(mt5Symbol); // Ensure MT5 starts streaming this symbol

    const tfMap = {
      "M1": "M1",
      "M5": "M5",
      "M15": "M15",
      "M30": "M30",
      "H1": "H1",
      "H4": "H4",
      "D1": "D1",
      "W1": "W1",
      "MN1": "MN1"
    };

    let interval = tfMap[timeframe.toUpperCase()] || "D1";

    const cacheKey = `${mt5Symbol}_${interval}_${limit}`;

    const ttl = (await isMarketClosed(mt5Symbol)) ? 60 * 60 * 1000 : CACHE_TTL_MS;

    if (marketCache.has(cacheKey)) {
      const cached = marketCache.get(cacheKey);
      if (cached instanceof Promise) {
         // Wait for the ongoing fetch to finish
         const resolvedData = await cached;
         return res.json(resolvedData);
      }
      if (Date.now() - cached.timestamp < ttl) {
        return res.json(cached.data);
      }
    }

    const fetchPromise = (async () => {
      const now = new Date();
      const startDate = new Date();

      const isCrypto = mt5Symbol.includes("BTC") || mt5Symbol.includes("ETH");

      if (interval.startsWith("M") && interval !== "MN1") {
         const mins = parseInt(interval.replace("M","")) * count * 2;
         startDate.setMinutes(startDate.getMinutes() - mins);

         // Optimization: Do not request 3 full days blindly! This crashes MT5 with 4000+ M1 bars.
         if (!isCrypto) {
           const day = startDate.getUTCDay();
           if (day === 0) startDate.setDate(startDate.getDate() - 2); // Sunday -> Friday
           else if (day === 6) startDate.setDate(startDate.getDate() - 1); // Saturday -> Friday
           else if (day === 1) startDate.setDate(startDate.getDate() - 3); // Monday -> Friday
         }
      } else if (interval.startsWith("H")) {
         const hrs = parseInt(interval.replace("H","")) * count * 2;
         startDate.setHours(startDate.getHours() - hrs);

         if (!isCrypto) {
           const day = startDate.getUTCDay();
           if (day === 0) startDate.setDate(startDate.getDate() - 2);
           else if (day === 6) startDate.setDate(startDate.getDate() - 1);
           else if (day === 1) startDate.setDate(startDate.getDate() - 3);
         }
      } else if (interval === "D1") {
         startDate.setDate(startDate.getDate() - (count * 2));
      } else {
         startDate.setFullYear(startDate.getFullYear() - 5);
      }

      const pad = n => n.toString().padStart(2, '0');
      const formatMt5Date = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

      const fromDateStr = formatMt5Date(startDate);
      const toDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const toDateStr = formatMt5Date(toDate);

      let historyData = null;
      let retries = 3;
      let lastErr = null;

      while (retries > 0) {
        try {
          historyData = await fetchMt5History(mt5Symbol, interval, fromDateStr, toDateStr);
          break; // Success
        } catch (fetchErr) {
          lastErr = fetchErr;
          if (fetchErr.message.includes("404")) {
            throw new Error(`404: Symbol ${mt5Symbol} tidak ditemukan di MT5`);
          }
          // MT5 CopyRates returns -1 (500 Failed) if history is not synchronized yet.
          // It will start downloading automatically, so we wait and retry.
          if (fetchErr.message.includes("Failed to retrieve data") || fetchErr.message.includes("500") || fetchErr.message.includes("fetch failed")) {
            retries--;
            if (retries > 0) {
              await new Promise(r => setTimeout(r, 600)); // wait 600ms before retry
              continue;
            }
          }
          throw fetchErr;
        }
      }

      if (!historyData) {
        throw lastErr || new Error("Failed to retrieve history after retries");
      }

      if (!historyData || !Array.isArray(historyData.data) || historyData.data.length === 0) {
        return [];
      }

      let candles = historyData.data.map(q => ({
        time: Math.floor(new Date(q.time).getTime() / 1000),
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.real_volume || q.tick_volume || 0
      }));

      if (candles.length > limit) {
        candles = candles.slice(-limit);
      }

      const livePrice = latestPrices[mt5Symbol];
      if (livePrice && candles.length > 0) {
        const lastCandle = candles[candles.length - 1];
        lastCandle.close = livePrice.price;
        if (livePrice.price > lastCandle.high) lastCandle.high = livePrice.price;
        if (livePrice.price < lastCandle.low) lastCandle.low = livePrice.price;
      }

      marketCache.set(cacheKey, { timestamp: Date.now(), data: candles });
      return candles;
    })();

    // Put the promise in the cache so parallel requests await it
    marketCache.set(cacheKey, fetchPromise);

    try {
      const result = await fetchPromise;
      res.json(result);
    } catch (err) {
      marketCache.delete(cacheKey);
      if (err.message.startsWith("404:")) {
        return res.status(404).json({ detail: err.message.slice(4).trim() });
      }
      throw err;
    }
  } catch (err) {
    logger.error("[GET /api/market/candles] error", { error: err.message });
    res.status(500).json({ detail: "Gagal mengambil data dari MT5 Bridge" });
  }
});

router.get("/ticker", (req, res) => {
  // Returns the live prices sourced from the MT5 WebSocket EA
  const { symbol } = req.query;
  if (symbol) {
    const mt5Symbol = symbol.toUpperCase();
    subscribeToSymbol(mt5Symbol); // Ensure MT5 starts streaming this symbol

    if (latestPrices[mt5Symbol]) {
      return res.json({ symbol: mt5Symbol, ...latestPrices[mt5Symbol] });
    } else {
      return res.status(404).json({ error: "No live data available for this symbol from MT5" });
    }
  }
  return res.json(latestPrices);
});

// Cache untuk kalender ekonomi.
let calendarCache = null;
let calendarCacheTime = 0;
const CALENDAR_TTL_MS = 6 * 60 * 60 * 1000;

const CURRENCY_TO_COUNTRY = {
  "USD": "US", "EUR": "EU", "GBP": "GB", "JPY": "JP",
  "AUD": "AU", "NZD": "NZ", "CAD": "CA", "CHF": "CH",
  "CNY": "CN", "SGD": "SG", "ZAR": "ZA"
};

router.get("/economic-calendar", async (req, res) => {
  try {
    if (calendarCache && Date.now() - calendarCacheTime < CALENDAR_TTL_MS) {
      return res.json(calendarCache);
    }

    const response = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EconCalendarBot/1.0)",
        "Accept": "application/json",
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      throw new Error("Response bukan JSON (kemungkinan rate-limited)");
    }

    const eventsRaw = await response.json();

    if (!Array.isArray(eventsRaw) || eventsRaw.length === 0) {
      if (calendarCache) return res.json(calendarCache);
      return res.json({ generatedAt: new Date().toISOString(), events: [] });
    }

    const events = eventsRaw
      .filter(ev => ev.impact !== "Holiday")
      .map(ev => {
        let importance = "none";
        const imp = (ev.impact || "").toLowerCase();
        if (imp === "high") importance = "high";
        else if (imp === "medium") importance = "medium";
        else if (imp === "low") importance = "low";

        const isoTime = ev.date || new Date().toISOString();

        const currency = (ev.country || "USD").toUpperCase();
        const countryCode = CURRENCY_TO_COUNTRY[currency] || currency.slice(0, 2).toUpperCase();

        return {
          time: isoTime,
          country: countryCode,
          currency: currency,
          event: ev.title || "Unknown Event",
          importance: importance,
          actual: ev.actual === "" ? null : (ev.actual ?? null),
          forecast: ev.forecast === "" ? null : (ev.forecast ?? null),
          previous: ev.previous === "" ? null : (ev.previous ?? null)
        };
      });

    calendarCache = {
      generatedAt: new Date().toISOString(),
      events: events
    };
    calendarCacheTime = Date.now();

    res.json(calendarCache);
  } catch (err) {
    logger.warn("[GET /api/market/economic-calendar] error", { error: err.message });

    if (calendarCache) {
      logger.warn("[economic-calendar] Serving stale cache karena fetch gagal");
      return res.json(calendarCache);
    }

    res.json({ generatedAt: new Date().toISOString(), events: [] });
  }
});

router.get("/symbols", async (req, res) => {
  try {
    const symbols = await getMt5SymbolsCached();
    res.json(symbols);
  } catch (err) {
    // FIX (bug nyata): sebelumnya catch block ini mereferensikan
    // `cachedSymbols` yang TIDAK PERNAH dideklarasikan di file ini —
    // kalau getMt5SymbolsCached() benar-benar throw, baris `if (cachedSymbols)`
    // sendiri akan throw ReferenceError (bukan fallback stale-serve yang
    // dimaksud), menutupi error asli dengan error yang membingungkan.
    // Simbol saat ini hardcoded (tidak pernah benar-benar fetch/throw),
    // jadi cukup log + response error yang jelas tanpa fallback semu.
    logger.error("[GET /api/market/symbols] error", { error: err.message });
    res.status(500).json({ error: "Gagal memuat katalog simbol" });
  }
});

export default router;
