import { container } from "tsyringe";
import { logger } from "@core/logging/logger.js";
import { FetchNewsUseCase } from "@application/use-cases/news/FetchNewsUseCase.js";
import { StoreNewsUseCase } from "@application/use-cases/news/StoreNewsUseCase.js";
import { INewsProvider } from "@application/ports/INewsProvider.js";

export class NewsPollingJob {
  static async runNewsPolling(provider: INewsProvider): Promise<void> {
    const fetchUseCase = container.resolve(FetchNewsUseCase);
    const storeUseCase = container.resolve(StoreNewsUseCase);
    
    const categories = ['general', 'forex', 'crypto'];
    for (const category of categories) {
      try {
        const articles = await fetchUseCase.execute(provider, category);
        if (articles.length > 0) {
          await storeUseCase.execute(articles, provider.getProviderName());
        }
      } catch (err) {
        logger.error(`Fetch news failed for ${provider.getProviderName()} (${category})`, { context: "News", error: (err as Error).message });
      }
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
