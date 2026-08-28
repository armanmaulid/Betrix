import { inject, injectable } from "tsyringe";
import { NewsRepository } from "@modules/news/domain/NewsRepository.js";
import { NewsArticle } from "@modules/news/domain/NewsArticle.js";
import { INotifier } from "@domain/ports/INotifier.js";
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
