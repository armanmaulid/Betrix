import { INewsProvider, RawNewsArticle } from "@application/ports/INewsProvider.js";
import { env } from "@config/env.js";
import { injectable } from "tsyringe";

@injectable()
export class FinnhubNewsAdapter implements INewsProvider {
  getProviderName() {
    return "Finnhub";
  }
  
  getPollingIntervalMs() {
    // Finnhub free tier is 60 calls/min. 3 categories * 10 seconds = 18 calls/min.
    return (env.FINNHUB_POLLING_INTERVAL_SEC || 10) * 1000;
  }
  
  async fetchNews(category: string): Promise<RawNewsArticle[]> {
    if (!env.FINNHUB_API_KEY) return [];
    
    const url = `https://finnhub.io/api/v1/news?category=${category}&token=${env.FINNHUB_API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Finnhub API Error: Status ${response.status}`);
    }
    
    const data = await response.json() as any[];
    return data
      .filter((item: any) => item.summary && item.summary.trim() !== '')
      .slice(0, 20)
      .map((item: any) => ({
        source: item.source || 'Finnhub',
        headline: item.headline,
        url: item.url,
        summary: item.summary,
        publishedAt: item.datetime ? new Date(item.datetime * 1000) : new Date()
      }));
  }
}
