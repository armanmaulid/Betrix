import { inject, injectable } from "tsyringe";
import { NewsRepository } from "@domain/repositories/NewsRepository.js";
import { NewsArticle } from "@domain/entities/NewsArticle.js";
import { INotifier } from "@application/ports/INotifier.js";
import { logger } from "@core/logging/logger.js";

@injectable()
export class StoreNewsUseCase {
  constructor(
    @inject("NewsRepository") private newsRepo: NewsRepository,
    @inject("INotifier") private notifier: INotifier
  ) {}

  async execute(articles: NewsArticle[], sourceName: string = "Provider"): Promise<number> {
    if (articles.length === 0) return 0;
    
    const savedArticles = await this.newsRepo.saveMany(articles);
    
    if (savedArticles.length > 0) {
      this.notifier.broadcastGlobal("news_update", savedArticles);
      logger.info(`Saved ${savedArticles.length} new articles from ${sourceName}`, { context: "News" });
    }
    
    return savedArticles.length;
  }
}
