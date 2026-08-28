import { inject, injectable } from "tsyringe";
import { INewsProvider } from "@modules/news/domain/INewsProvider.js";
import { NewsService } from "../NewsService.js";
import { NewsArticle } from "@modules/news/domain/NewsArticle.js";

@injectable()
export class FetchNewsUseCase {
  constructor(
    @inject("NewsService") private newsService: NewsService
  ) {}

  async execute(provider: INewsProvider, category: string): Promise<NewsArticle[]> {
    const rawArticles = await provider.fetchNews(category);
    if (rawArticles.length === 0) return [];
    
    return rawArticles.map(raw => this.newsService.createAndTagArticle(raw, category));
  }
}
