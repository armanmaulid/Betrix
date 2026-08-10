import { inject, injectable } from "tsyringe";
import { NewsRepository } from "@domain/repositories/NewsRepository.js";
import { NewsArticle } from "@domain/entities/NewsArticle.js";
import { FinnhubClient } from "@data/external/FinnhubClient.js";
import { logger } from "@core/logging/logger.js";

const ASSET_TAGS = ["EUR", "USD", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD", "Gold", "Oil", "BTC", "ETH"];

@injectable()
export class NewsService {
  constructor(
    @inject("NewsRepository") private newsRepo: NewsRepository,
    @inject("FinnhubClient") private finnhubClient: FinnhubClient
  ) {}

  async fetchAndStoreNews(): Promise<number> {
    // This is a placeholder - in reality you'd fetch from a news API
    // For now, we'll just return 0
    logger.debug("News fetch not implemented - using Finnhub for market data only", { context: "News" });
    return 0;
  }

  async cleanupOldNews(days: number): Promise<number> {
    return this.newsRepo.cleanupOlderThan(days);
  }
}