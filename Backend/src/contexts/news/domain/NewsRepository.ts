import type { NewsArticle } from "./NewsArticle.js";

export interface NewsRepository {
  save(article: NewsArticle): Promise<NewsArticle>;
  saveMany(articles: NewsArticle[]): Promise<NewsArticle[]>;
  findLatest(limit: number, offset?: number): Promise<NewsArticle[]>;
  findByAssetTags(tags: string[], limit: number, offset?: number): Promise<NewsArticle[]>;
  findById(id: string): Promise<NewsArticle | null>;
  cleanupOlderThan(days: number): Promise<number>;
}