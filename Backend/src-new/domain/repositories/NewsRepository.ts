import type { NewsArticle } from "../entities/NewsArticle.js";

export interface NewsRepository {
  save(article: NewsArticle): Promise<NewsArticle>;
  saveMany(articles: NewsArticle[]): Promise<number>;
  findLatest(limit: number, offset?: number): Promise<NewsArticle[]>;
  findByAssetTags(tags: string[], limit: number, offset?: number): Promise<NewsArticle[]>;
  findById(id: string): Promise<NewsArticle | null>;
  cleanupOlderThan(days: number): Promise<number>;
}