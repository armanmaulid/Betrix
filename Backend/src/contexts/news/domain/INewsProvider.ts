export interface RawNewsArticle {
  source: string;
  headline: string;
  url: string;
  summary: string;
  publishedAt: Date;
}

export interface INewsProvider {
  getProviderName(): string;
  getPollingIntervalMs(): number;
  fetchNews(category: string): Promise<RawNewsArticle[]>;
}
