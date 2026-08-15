import { container } from "tsyringe";
import { logger } from "@core/logging/logger.js";
import { SymbolService } from "@application/services/SymbolService.js";
import { CalendarService } from "@application/services/CalendarService.js";
import { SystemCleanupUseCase } from "@application/use-cases/admin/SystemCleanupUseCase.js";
import { SseNotifier } from "@infrastructure/sse/SseNotifier.js";
import { FinnhubClient } from "@data/external/FinnhubClient.js";

// Jobs
import { Mt5SubscriptionJob } from "./Mt5SubscriptionJob.js";
import { DailySyncJob } from "./DailySyncJob.js";
import { HourlyCleanupJob } from "./HourlyCleanupJob.js";
import { NewsPollingJob } from "./NewsPollingJob.js";

export async function runStartupJobs() {
  // --- STAGE 1: LIGHTEST (Instantiation & Timer Scheduling) ---
  
  // 1. Initialize Finnhub (Object instantiation only)
  container.resolve(FinnhubClient);
  logger.info("Finnhub Client initialized", { context: "Finnhub" });

  // --- STAGE 2: LIGHT - MEDIUM (WebSocket Connection & Subscriptions) ---
  
  // 3. Setup MT5 connections, callbacks, and WebSocket
  // Note: setupSubscriptions() is NOT called here explicitly because the
  // onReconnect callback (set in setupAndConnect) already calls it as soon
  // as the WebSocket connects. Calling it here too would cause duplicate
  // subscriptions due to a race condition.
  await Mt5SubscriptionJob.setupAndConnect();

  // --- STAGE 3 & 4: HEAVY OPERATIONS (Run Asynchronously in Background) ---
  
  // We wrap these in a fire-and-forget IIFE (Immediately Invoked Function Expression) 
  // so they don't block the main server startup thread.
  (async () => {
    logger.info("Starting heavy background syncs (Cleanup, Calendar, Symbols, Market Cache)...", { context: "Startup" });
    
    // 5. Cleanup jobs (Executes simple DELETE queries in Postgres)
    const cleanupUseCase = container.resolve(SystemCleanupUseCase);
    await cleanupUseCase.execute().catch(err => 
      logger.error("Startup cleanup failed", { context: "Startup", error: (err as Error).message })
    );

    // 6. Sync calendar (Fetches calendar data via HTTP and saves to Postgres)
    const calendarService = container.resolve(CalendarService);
    await calendarService.syncIfNeeded().catch(err => 
      logger.error("Sync calendar failed", { context: "Startup", error: err.message })
    );

    // 7. Sync symbols (Fetches thousands of symbols via HTTP and upserts to Postgres)
    const symbolService = container.resolve(SymbolService);
    await symbolService.syncBrokerSymbols().catch(err => 
      logger.error("Sync broker symbols failed", { context: "Startup", error: err.message })
    );
    

    logger.info("Heavy background syncs completed successfully.", { context: "Startup" });
  })();
}

export async function startBackgroundJobs() {
  // Heartbeat every 30 seconds to keep frontend SSE connections alive
  const notifier = container.resolve<SseNotifier>(SseNotifier);
  setInterval(() => notifier.sendHeartbeat(), 30 * 1000).unref();
  
  // Hourly cleanup (Cleans up expired sessions, etc. every hour)
  HourlyCleanupJob.start();
  
  // Daily jobs (Fetches new Calendar & Symbols, runs at Broker Midnight + 5 minutes)
  DailySyncJob.start();
  
  // News Polling (Each news provider has its own polling interval)
  NewsPollingJob.startAllProviders();
  
  logger.info("Background jobs scheduled", { context: "Scheduler" });
}