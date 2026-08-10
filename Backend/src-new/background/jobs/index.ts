import { container } from "tsyringe";
import { logger } from "@core/logging/logger.js";
import { secondsUntilBrokerMidnight } from "@core/utils/date.js";
import { WarmupMarketCacheUseCase } from "@application/use-cases/market/WarmupMarketCacheUseCase.js";
import { SymbolService } from "@domain/services/SymbolService.js";
import { CalendarService } from "@domain/services/CalendarService.js";
import { NewsService } from "@domain/services/NewsService.js";
import { cleanupExpiredSessions, cleanupOldFailedAttempts, cleanupExpiredTokens, cleanupOldUsageRecords, cleanupOldNews } from "@domain/services/CleanupService.js";
import { sendHeartbeat } from "@domain/services/sseManager.js";
import { Mt5Client } from "@data/external/Mt5Client.js";
import { FinnhubClient } from "@data/external/FinnhubClient.js";
import { SymbolRepository } from "@domain/repositories/SymbolRepository.js";

export async function runStartupJobs() {
  // Initialize MT5 and Finnhub FIRST
  const mt5Client = container.resolve(Mt5Client);
  
  // Set up MT5 callbacks for real-time data
  mt5Client.setCallbacks({
    onPriceTick: async (tick) => {
      logger.debug(`Price update: ${tick.symbol} bid=${tick.bid} ask=${tick.ask}`, { context: "MT5" });
    },
    onOHLCUpdate: async (update) => {
      logger.debug(`OHLC update: ${update.symbol} ${update.timeframe}`, { context: "MT5" });
    },
    onMarketBookUpdate: async (update) => {
      logger.debug(`Market book update: ${update.symbol}`, { context: "MT5" });
    },
    onCalendarUpdate: async (update) => {
      logger.debug(`Calendar update: event ${update.event_id}`, { context: "MT5" });
    }
  });

  // Connect to MT5 and wait for connection
  await mt5Client.connect().catch(err => 
    logger.error("MT5 connection failed", { context: "MT5", error: err.message })
  );
  logger.info("MT5 Bridge Client initialized", { context: "MT5" });

  // Warmup market cache
  const warmupUseCase = container.resolve(WarmupMarketCacheUseCase);
  await warmupUseCase.execute().catch(err => 
    logger.error("Warmup market cache failed", { context: "Startup", error: err.message })
  );

  // Sync symbols and calendar (now using HTTP)
  const symbolService = container.resolve(SymbolService);
  await symbolService.syncBrokerSymbols().catch(err => 
    logger.error("Sync broker symbols failed", { context: "Startup", error: err.message })
  );
  
  const calendarService = container.resolve(CalendarService);
  await calendarService.syncIfNeeded().catch(err => 
    logger.error("Sync calendar failed", { context: "Startup", error: err.message })
  );

  // Initialize MT5 tracking subscriptions (via HTTP)
  try {
    const symbolRepo = container.resolve("SymbolRepository") as { findActive: () => Promise<Array<{ symbol: string }>> };
    const activeSymbols = await symbolRepo.findActive();
    const trackingSymbols = activeSymbols.map(s => s.symbol).slice(0, 100);
    
    if (trackingSymbols.length > 0) {
      await container.resolve(Mt5Client).trackPrices(trackingSymbols);
      logger.info(`Subscribed to price tracking for ${trackingSymbols.length} symbols`, { context: "MT5" });
      
      const majorSymbols = trackingSymbols.slice(0, 20);
      const ohlcRequests = majorSymbols.map(symbol => ({
        symbol,
        timeframe: "M5",
        depth: 3
      }));
      await container.resolve(Mt5Client).trackOHLC(ohlcRequests);
      logger.info(`Subscribed to OHLC tracking for ${ohlcRequests.length} symbols`, { context: "MT5" });
      
      const mbookSymbols = trackingSymbols.slice(0, 10);
      await container.resolve(Mt5Client).trackMarketBook(mbookSymbols);
      logger.info(`Subscribed to market book tracking for ${mbookSymbols.length} symbols`, { context: "MT5" });
    }
    
    await container.resolve(Mt5Client).trackCalendar("", "");
    logger.info("Subscribed to calendar tracking", { context: "MT5" });
  } catch (err) {
    logger.error("Failed to setup MT5 tracking subscriptions", { context: "MT5", error: (err as Error).message });
  }
  
  container.resolve(FinnhubClient);
  logger.info("Finnhub Client initialized", { context: "Finnhub" });

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

  container.resolve(FinnhubClient);
  logger.info("Finnhub Client initialized", { context: "Finnhub" });

  // Schedule D1 cache refresh
  scheduleD1CacheRefresh();
}

export async function runHourlyCleanup() {
  const cachePort = container.resolve("CachePort") as { cleanup: () => number };
  const results = await Promise.allSettled([
    cleanupExpiredSessions(),
    cleanupOldFailedAttempts(),
    cleanupExpiredTokens(),
    cleanupOldUsageRecords(),
    cleanupOldNews(7),
    cachePort.cleanup(),
  ]);
  
  const total = results.reduce((sum, r) => sum + (r.status === "fulfilled" ? r.value : 0), 0);
  if (total > 0) {
    logger.info(`Removed ${total} expired record(s)`, { context: "Cleanup" });
  }
}

export async function runDailyJobs() {
  const symbolService = container.resolve(SymbolService);
  await symbolService.syncBrokerSymbols().catch(err => 
    logger.error("Daily sync broker symbols failed", { context: "DailyJob", error: err.message })
  );
  
  const calendarService = container.resolve(CalendarService);
  await calendarService.syncIfNeeded().catch(err => 
    logger.error("Daily sync calendar failed", { context: "DailyJob", error: err.message })
  );
  
  await calendarService.cleanupOldEvents().catch(err => 
    logger.error("Daily cleanup calendar failed", { context: "DailyJob", error: err.message })
  );
}

export async function runNewsPolling() {
  if (!process.env.FINNHUB_API_KEY) {
    logger.warn("FINNHUB_API_KEY not set - news polling disabled", { context: "News" });
    return;
  }
  
  const newsService = container.resolve(NewsService);
  await newsService.fetchAndStoreNews().catch(err => 
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
      const warmupUseCase = container.resolve(WarmupMarketCacheUseCase);
      await warmupUseCase.execute();
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