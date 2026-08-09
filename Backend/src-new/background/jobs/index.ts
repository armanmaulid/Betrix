import { container } from "tsyringe";
import { pgClient } from "@data/orm/pgClient.js";
import { redisClient } from "@data/orm/redisClient.js";
import { logger } from "@core/logging/logger.js";
import { secondsUntilBrokerMidnight } from "@core/utils/date.js";
import { warmupMarketCache } from "@application/use-cases/market/WarmupMarketCacheUseCase.js"; // To be created
import { syncBrokerSymbols } from "@domain/services/SymbolService.js"; // To be created
import { syncCalendarIfNeeded, cleanupOldCalendarEvents } from "@domain/services/CalendarService.js"; // To be created
import { fetchAndStoreNews, cleanupOldNews } from "@domain/services/NewsService.js"; // To be created
import { cleanupExpiredSessions, cleanupOldFailedAttempts, cleanupExpiredTokens, cleanupOldUsageRecords } from "@domain/services/CleanupService.js"; // To be created
import { sendHeartbeat } from "@domain/services/sseManager.js";
import { initializeMt5Client } from "@data/external/Mt5Client.js";
import { initializeFinnhubClient } from "@data/external/FinnhubClient.js";

export async function runStartupJobs() {
  // Cleanup jobs
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
  
  logger.info(`Startup cleanup: ${cleanupSummary}`, { context: "Startup" });

  // Warmup market cache
  await warmupMarketCache().catch(err => 
    logger.error("Warmup market cache failed", { context: "Startup", error: err.message })
  );

  // Sync symbols and calendar
  await syncBrokerSymbols().catch(err => 
    logger.error("Sync broker symbols failed", { context: "Startup", error: err.message })
  );
  
  await syncCalendarIfNeeded().catch(err => 
    logger.error("Sync calendar failed", { context: "Startup", error: err.message })
  );

  // Initialize MT5 and Finnhub
  initializeMt5Client();
  logger.info("MT5 Bridge Client initialized", { context: "MT5" });
  
  initializeFinnhubClient();

  // Schedule D1 cache refresh
  scheduleD1CacheRefresh();
}

export async function runHourlyCleanup() {
  const results = await Promise.allSettled([
    cleanupExpiredSessions(),
    cleanupOldFailedAttempts(),
    cleanupExpiredTokens(),
    cleanupOldUsageRecords(),
    cleanupOldNews(7),
  ]);
  
  const total = results.reduce((sum, r) => sum + (r.status === "fulfilled" ? r.value : 0), 0);
  if (total > 0) {
    logger.info(`Removed ${total} expired record(s)`, { context: "Cleanup" });
  }
}

export async function runDailyJobs() {
  await syncBrokerSymbols().catch(err => 
    logger.error("Daily sync broker symbols failed", { context: "DailyJob", error: err.message })
  );
  
  await syncCalendarIfNeeded().catch(err => 
    logger.error("Daily sync calendar failed", { context: "DailyJob", error: err.message })
  );
  
  await cleanupOldCalendarEvents().catch(err => 
    logger.error("Daily cleanup calendar failed", { context: "DailyJob", error: err.message })
  );
}

export async function runNewsPolling() {
  if (!process.env.FINNHUB_API_KEY) {
    logger.warn("FINNHUB_API_KEY not set - news polling disabled", { context: "News" });
    return;
  }
  
  await fetchAndStoreNews().catch(err => 
    logger.error("Fetch news failed", { context: "News", error: err.message })
  );
}

function scheduleD1CacheRefresh() {
  const ttl = secondsUntilBrokerMidnight();
  const delayMs = (ttl + 90) * 1000;
  const nextRefresh = new Date(Date.now() + delayMs);
  
  logger.info(
    `D1 cache refresh scheduled for ${nextRefresh.toISOString()} (in ${(ttl / 3600).toFixed(1)} hours)`,
    { context: "D1Cache" }
  );

  const timer = setTimeout(async () => {
    logger.info("Starting auto D1 cache refresh (broker day change)...", { context: "D1Cache" });
    try {
      await warmupMarketCache();
    } catch (err) {
      logger.error(`Auto D1 cache refresh failed: ${(err as Error).message}`, { context: "D1Cache" });
    }
    scheduleD1CacheRefresh(); // Schedule next
  }, delayMs);
  
  timer.unref?.();
}

export async function startBackgroundJobs() {
  // Heartbeat every 30s
  setInterval(() => sendHeartbeat(), 30 * 1000).unref();
  
  // Hourly cleanup
  setInterval(() => runHourlyCleanup(), 60 * 60 * 1000).unref();
  
  // Daily jobs at 2am
  setInterval(() => runDailyJobs(), 24 * 60 * 60 * 1000).unref();
  
  // News polling every 10s if API key exists
  if (process.env.FINNHUB_API_KEY) {
    setInterval(() => runNewsPolling(), 10 * 1000).unref();
  }
  
  logger.info("Background jobs scheduled", { context: "Scheduler" });
}