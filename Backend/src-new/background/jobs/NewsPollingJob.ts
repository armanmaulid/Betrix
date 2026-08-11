import { container } from "tsyringe";
import { logger } from "@core/logging/logger.js";
import { FetchNewsUseCase } from "@application/use-cases/news/FetchNewsUseCase.js";
import { StoreNewsUseCase } from "@application/use-cases/news/StoreNewsUseCase.js";
import { INewsProvider } from "@application/ports/INewsProvider.js";

export class NewsPollingJob {
  private static consecutiveErrors = new Map<string, number>();
  private static backoffUntil = new Map<string, number>();

  static async runNewsPolling(provider: INewsProvider): Promise<void> {
    const providerName = provider.getProviderName();

    // Skip if in backoff period
    const until = this.backoffUntil.get(providerName) || 0;
    if (Date.now() < until) return;

    const fetchUseCase = container.resolve(FetchNewsUseCase);
    const storeUseCase = container.resolve(StoreNewsUseCase);
    
    const categories = ['general', 'forex', 'crypto'];
    let hasError = false;

    for (const category of categories) {
      try {
        const articles = await fetchUseCase.execute(provider, category);
        if (articles.length > 0) {
          await storeUseCase.execute(articles, providerName);
        }
      } catch (err) {
        hasError = true;
        logger.error(`Fetch news failed for ${providerName} (${category})`, { context: "News", error: (err as Error).message });
      }
    }

    if (hasError) {
      const errors = (this.consecutiveErrors.get(providerName) || 0) + 1;
      this.consecutiveErrors.set(providerName, errors);
      // Quadratic backoff: 10s, 40s, 90s, 160s, capped at 5 min
      const backoffMs = Math.min(errors * errors * 10_000, 300_000);
      this.backoffUntil.set(providerName, Date.now() + backoffMs);
      logger.warn(`News provider '${providerName}' backing off for ${backoffMs / 1000}s after ${errors} consecutive error(s)`, { context: "News" });
    } else {
      // Reset on success
      this.consecutiveErrors.delete(providerName);
      this.backoffUntil.delete(providerName);
    }
  }

  static startAllProviders(): void {
    const newsProviders = container.resolveAll<INewsProvider>("INewsProvider");
    for (const provider of newsProviders) {
      const intervalMs = provider.getPollingIntervalMs();
      setInterval(() => NewsPollingJob.runNewsPolling(provider), intervalMs).unref();
      logger.info(`Scheduled news provider '${provider.getProviderName()}' every ${intervalMs / 1000}s`, { context: "Scheduler" });
    }
  }
}
