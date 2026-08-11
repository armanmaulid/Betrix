import { container } from "tsyringe";
import { env } from "@config/env.js";
import { logger } from "@core/logging/logger.js";
import { secondsUntilBrokerMidnight } from "@core/utils/date.js";
import { WarmupMarketCacheUseCase } from "@application/use-cases/market/WarmupMarketCacheUseCase.js";

export class D1CacheRefreshJob {
  static start(): void {
    const ttl = secondsUntilBrokerMidnight(env.MT5_BROKER_UTC_OFFSET);
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
      D1CacheRefreshJob.start(); // Schedule next
    }, delayMs);
    
    timer.unref?.();
  }
}
