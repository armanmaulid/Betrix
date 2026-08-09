import { container } from "tsyringe";
import { NewsRepository } from "@domain/repositories/NewsRepository.js";
import { NewsArticle } from "@domain/entities/NewsArticle.js";
import { FinnhubClient } from "@data/external/FinnhubClient.js";
import { logger } from "@core/logging/logger.js";

const ASSET_TAGS = ["EUR", "USD", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD", "Gold", "Oil", "BTC", "ETH"];

export async function fetchAndStoreNews(): Promise<number> {
  const newsRepo = container.resolve(NewsRepository);
  const finnhubClient = container.resolve(FinnhubClient);
  
  // This is a placeholder - in reality you'd fetch from a news API
  // For now, we'll just return 0
  logger.debug("News fetch not implemented - using Finnhub for market data only", { context: "News" });
  return 0;
}

export async function cleanupOldNews(days: number): Promise<number> {
  const newsRepo = container.resolve(NewsRepository);
  return newsRepo.cleanupOlderThan(days);
}