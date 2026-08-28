import { inject, injectable } from "tsyringe";
import { NewsRepository } from "@modules/news/domain/NewsRepository.js";
import { NewsArticle } from "@modules/news/domain/NewsArticle.js";
import { RawNewsArticle } from "@modules/news/domain/INewsProvider.js";
import { tagNewsArticle } from "@modules/news/domain/newsTagging.js";

@injectable()
export class NewsService {
  constructor(
    @inject("NewsRepository") private newsRepo: NewsRepository
  ) {}

  createAndTagArticle(raw: RawNewsArticle, category: string): NewsArticle {
    const tags = tagNewsArticle(raw, category);

    return NewsArticle.create({
      source: raw.source,
      title: raw.headline,
      url: raw.url,
      summary: raw.summary,
      assetTags: tags,
      publishedAt: raw.publishedAt
    });
  }

  async cleanupOldNews(days: number): Promise<number> {
    return this.newsRepo.cleanupOlderThan(days);
  }
}