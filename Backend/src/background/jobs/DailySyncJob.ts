import { container } from "tsyringe";
import { env } from "@config/env.js";
import { logger } from "@core/logging/logger.js";
import { secondsUntilBrokerMidnight } from "@core/utils/date.js";
import { SymbolService } from "@modules/market/application/services/SymbolService.js";
import { CalendarService } from "@modules/market/application/services/CalendarService.js";

export class DailySyncJob {
  static async execute(): Promise<void> {
    const symbolService = container.resolve(SymbolService);
    // force: true — daily sync selalu full refresh (bypass throttle boot),
    // jadwal sudah berbasis broker time (secondsUntilBrokerMidnight + MT5_BROKER_UTC_OFFSET).
    await symbolService.syncBrokerSymbols({ force: true }).catch(err => 
      logger.error("Daily sync broker symbols failed", { context: "DailyJob", error: err.message })
    );
    
    const calendarService = container.resolve(CalendarService);
    await calendarService.syncIfNeeded().catch(err => 
      logger.error("Daily sync calendar failed", { context: "DailyJob", error: err.message })
    );
  }

  static start(): void {
    const ttl = secondsUntilBrokerMidnight(env.MT5_BROKER_UTC_OFFSET);
    // Schedule at 00:05:00 broker time (5 minutes after midnight to avoid race conditions with D1 refresh)
    const delayMs = (ttl + 300) * 1000; 
    
    const timer = setTimeout(async () => {
      logger.info("Starting daily background jobs (broker day change)...", { context: "DailyJob" });
      await DailySyncJob.execute();
      DailySyncJob.start(); // Schedule next day
    }, delayMs);
    
    timer.unref?.();
  }
}
