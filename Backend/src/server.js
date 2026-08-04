import "dotenv/config";
const startTime = Date.now();
import express from "express";
import { printStartupBanner } from "./utils/startupLogger.js";
import { printRoutes } from "./utils/routeMapper.js";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import passport from "passport";
import chatRoutes from "./routes/chat.js";
import authRoutes from "./routes/auth.js";
import usageRoutes from "./routes/usage.js";
import adminRoutes from "./routes/admin.js";
import messagesRoutes from "./routes/messages.js";
import activityRoutes from "./routes/activity.js";
import newsRoutes from "./routes/news.js";
import marketRoutes, { warmupMarketCache } from "./routes/market.js";
import { secondsUntilBrokerMidnight } from "./services/d1CacheStore.js";
import { fetchAndStoreNews, cleanupOldNews } from "./services/newsFetcher.js";
import { sendHeartbeat } from "./services/newsRealtimeStore.js";
import { healthCheck } from "./routes/health.js";
import { cleanupExpiredSessions } from "./services/sessionStore.js";
import { cleanupOldFailedAttempts } from "./services/loginAttemptStore.js";
import { cleanupExpiredTokens } from "./services/verificationStore.js";
import { cleanupOldUsageRecords } from "./services/tokenUsageStore.js";
import { sanitizeInput } from "./middleware/sanitize.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { normalizeRequestIP } from "./middleware/normalizeIP.js";
import { logger } from "./utils/logger.js";
import { pool } from "./db/pool.js";
import { initializeMt5Client } from "./services/mt5Client.js";
import { syncBrokerSymbols } from "./services/symbolStore.js";
import { syncCalendarIfNeeded, cleanupOldCalendarEvents } from "./services/calendarStore.js";
import "./config/passport.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Status penanda server sedang proses mati
let isShuttingDown = false;

// Middleware Graceful Shutdown: Tolak "tamu baru" jika restoran mau tutup
app.use((req, res, next) => {
  if (isShuttingDown) {
    res.set('Connection', 'close'); // Beritahu client agar tidak me-reuse koneksi TCP
    return res.status(503).json({ error: "Server is shutting down, please try again later" });
  }
  next();
});

app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS) || 1);

// Security headers
app.use(helmet());

// CORS whitelist
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:3000", "http://localhost:5173"]; // Default untuk dev

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: "15mb" }));

app.use(passport.initialize());

app.use(normalizeRequestIP);

app.use(sanitizeInput);

app.use(requestLogger);

// Rate limit per IP — kontrol kasar biar kredit AI provider tidak jebol.
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PER_MINUTE) || 30, // User: 30 req/min
  message: { error: "Terlalu banyak request, coba lagi sebentar lagi" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limit untuk auth endpoints (login/register)
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 menit
  max: 10, // 10 requests total (berhasil + gagal)
  message: { error: "Terlalu banyak percobaan login/register, coba lagi dalam 5 menit" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit tambahan khusus register — device fingerprint (IP+UA) gampang
// dipalsukan lewat script, jadi "1 device = 1 akun" TIDAK cukup untuk
// mencegah mass-registration atau email enumeration otomatis.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 jam
  max: Number(process.env.RATE_LIMIT_REGISTER_PER_HOUR) || 5,
  message: { error: "Terlalu banyak percobaan registrasi, coba lagi nanti" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth/register", registerLimiter);
app.use("/api/auth", authLimiter);
// Apply rate limiter ke semua /api/* KECUALI /api/admin, /api/market, /api/news
app.use("/api", (req, res, next) => {
  if (req.path.startsWith('/admin') || req.path.startsWith('/market') || req.path.startsWith('/news')) {
    return next();
  }
  limiter(req, res, next);
});

app.get("/health", healthCheck);

app.use("/api/auth", authRoutes);
app.use("/api", chatRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/me", activityRoutes);

app.use((err, req, res, next) => {
  logger.error("unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Terjadi kesalahan internal" });
});

const server = app.listen(PORT, async () => {
  const pkg = { name: "betrix-forex-ea-backend", version: "0.1.0" };

  const cleanups = await Promise.allSettled([
    cleanupExpiredSessions(),
    cleanupOldFailedAttempts(),
    cleanupExpiredTokens(),
    cleanupOldUsageRecords(),
    cleanupOldNews(7),
  ]);
  const labels = ["sessions", "login attempts", "verify tokens", "usage records", "old news"];
  const cleanupSummary = cleanups.map((r, i) =>
    r.status === "fulfilled" ? `${labels[i]}=${r.value}` : `${labels[i]}=err`
  ).join(", ");

  console.clear();
  await printStartupBanner({
    port: PORT,
    startTime,
    env: process.env.NODE_ENV || "development",
    packageInfo: pkg,
    cleanupSummary
  });

  // ── 5. Setup Intervals & Background Services ──
  setInterval(() => {
    Promise.allSettled([
      cleanupExpiredSessions(),
      cleanupOldFailedAttempts(),
      cleanupExpiredTokens(),
      cleanupOldUsageRecords(),
      cleanupOldNews(7),
    ]).then((results) => {
      const total = results.reduce((sum, r) =>
        sum + (r.status === "fulfilled" ? r.value : 0), 0);
      if (total > 0) logger.info(`removed ${total} expired record(s)`, { context: "Cleanup" });
    });
  }, 60 * 60 * 1000);

  fetchAndStoreNews().catch((err) =>
    logger.error("Fetch news gagal", { error: err.message })
  );

  setInterval(() => {
    fetchAndStoreNews().catch((err) =>
      logger.error("Auto-fetch news gagal", { error: err.message })
    );
  }, 10 * 1000);

  setInterval(() => sendHeartbeat(), 30 * 1000);

  printRoutes(app);

  // ── 6. Market Data Startup Sequence ──
  // Tahap 1: Pre-fetch 1D history untuk kalkulasi persentase dsb
  warmupMarketCache().then(async () => {
    // Tahap 2: Sync simbol & kalender dulu, SELESAI, sebelum WS realtime dibuka --
    // supaya tidak rebutan slot proses dengan handshake WS di EA yang single-threaded
    await syncBrokerSymbols().catch(err => {
      logger.error("Unexpected error in syncBrokerSymbols startup", { error: err.message, context: "System" });
    });

    await syncCalendarIfNeeded().catch(err => {
      logger.error("Unexpected error in syncCalendarIfNeeded", { error: err.message, context: "System" });
    });

    // Tahap 3: BARU buka koneksi realtime WebSocket ke MT5
    initializeMt5Client();
    logger.info("MT5 Bridge Client initialized", { context: "MT5" });

    // ── Auto Re-warmup D1 Cache ──────────────────────────────────
    // Jadwalkan refresh otomatis D1 cache setiap pergantian hari broker
    // (00:00 UTC+3). Begitu TTL Redis expired, backend langsung fetch
    // ulang 12 simbol utama dari MT5 dan isi Redis lagi — jadi user
    // yang login pagi-pagi selalu dapat data dari Redis, bukan MT5.
    function scheduleD1CacheRefresh() {
      const ttl = secondsUntilBrokerMidnight();
      // +90 detik buffer supaya D1 candle hari baru sudah terbentuk di MT5
      const delayMs = (ttl + 90) * 1000;
      const nextRefresh = new Date(Date.now() + delayMs);
      logger.info(
        `D1 cache refresh dijadwalkan pada ${nextRefresh.toISOString()} (dalam ${(ttl / 3600).toFixed(1)} jam)`,
        { context: "D1Cache" }
      );

      const timer = setTimeout(async () => {
        logger.info("Memulai auto re-warmup D1 cache (pergantian hari broker)...", { context: "D1Cache" });
        try {
          await warmupMarketCache();
        } catch (err) {
          logger.error(`Auto re-warmup D1 cache gagal: ${err.message}`, { context: "D1Cache" });
        }
        // Jadwalkan lagi untuk besok
        scheduleD1CacheRefresh();
      }, delayMs);
      timer.unref?.(); // Jangan halangi graceful shutdown
    }
    scheduleD1CacheRefresh();
  }).catch(err => {
    logger.error("Gagal melakukan warmupMarketCache di awal", { error: err.message });
  });

  // Background Job 24 Jam untuk kalender dan simbol
  setInterval(() => {
    syncBrokerSymbols().catch(err => {
      logger.error("Unexpected error in syncBrokerSymbols background job", { error: err.message, context: "System" });
    });
    syncCalendarIfNeeded().catch(err => {
      logger.error("Unexpected error in syncCalendarIfNeeded background job", { error: err.message, context: "System" });
    });
  }, 24 * 60 * 60 * 1000);

  cleanupOldCalendarEvents().catch(() => {});
  setInterval(() => {
    cleanupOldCalendarEvents().catch(err => {
      logger.error("Unexpected error in cleanupOldCalendarEvents", { error: err.message, context: "System" });
    });
  }, 24 * 60 * 60 * 1000);
});

// FIX (OOM/DoS hardening): default Node HTTP server tidak punya batas waktu
// untuk koneksi yang menggantung (slowloris-style: buka koneksi, kirim
// header pelan-pelan atau tidak sama sekali) — tiap koneksi begitu tetap
// memakai memory & file descriptor sampai client sendiri yang menutupnya.
// Banyak koneksi macet seperti ini bisa menghabiskan resource server.
server.keepAliveTimeout = Number(process.env.SERVER_KEEPALIVE_TIMEOUT_MS) || 65000;
// headersTimeout HARUS lebih besar dari keepAliveTimeout (syarat Node.js).
server.headersTimeout = Number(process.env.SERVER_HEADERS_TIMEOUT_MS) || 66000;
// Sengaja TIDAK set server.requestTimeout global: app ini punya endpoint
// SSE long-lived (/api/market/stream) yang sengaja dibuka lama. requestTimeout
// di level server bisa memutus paksa koneksi streaming yang masih aktif.
// keepAliveTimeout & headersTimeout di atas sudah cukup untuk proteksi
// slowloris (koneksi yang lambat/tidak pernah mengirim header lengkap)
// tanpa mengganggu response yang memang didesain untuk tetap terbuka.


// Graceful shutdown
// (Variabel isShuttingDown sudah dipindahkan ke atas untuk dipakai oleh middleware)

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  
  // Mengubah flag ini akan membuat middleware di atas mulai menolak koneksi/request baru
  // dengan header Connection: close dan status 503.
  isShuttingDown = true;

  logger.info(`${signal} received, starting graceful shutdown`, { context: "Shutdown" });

  // Putus seketika semua koneksi TCP yang sedang "nganggur" (idle keep-alive).
  // Ini seperti mengusir tamu yang sudah selesai makan tapi masih duduk ngobrol,
  // sehingga restoran bisa lebih cepat tutup. (Fitur Node.js >= 18.20)
  if (server.closeIdleConnections) {
    server.closeIdleConnections();
  }

  // Berhenti menerima tamu baru. Tapi tunggu tamu yang "masih ngunyah" (request aktif) sampai selesai.
  server.close(async () => {
    logger.info("HTTP server closed", { context: "Server" });

    try {
      await pool.end();
      logger.info("Database pool closed", { context: "Database" });

      logger.info("Graceful shutdown completed", { context: "Shutdown" });
      process.exit(0);
    } catch (err) {
      logger.error("Error during shutdown", { error: err.message });
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
