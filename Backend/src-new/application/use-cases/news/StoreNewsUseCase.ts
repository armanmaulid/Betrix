import { inject, injectable } from "tsyringe";
import { NewsRepository } from "@domain/repositories/NewsRepository.js";
import { NewsArticle } from "@domain/entities/NewsArticle.js";
import { broadcastGlobal } from "@domain/services/sseManager.js";
import { logger } from "@core/logging/logger.js";

@injectable()
export class StoreNewsUseCase {
  constructor(
    @inject("NewsRepository") private newsRepo: NewsRepository
  ) {}

  async execute(articles: NewsArticle[], sourceName: string = "Provider"): Promise<number> {
    if (articles.length === 0) return 0;
    
    const savedCount = await this.newsRepo.saveMany(articles);
    
    if (savedCount > 0) {
      broadcastGlobal("news_update", articles);
      logger.info(`Saved ${savedCount} new articles from ${sourceName}`, { context: "News" });
    }
    
    return savedCount;
  }
}
