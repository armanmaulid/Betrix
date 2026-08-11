import { inject, injectable } from "tsyringe";
import { NewsRepository } from "@domain/repositories/NewsRepository.js";
import { NewsArticle } from "@domain/entities/NewsArticle.js";
import { RawNewsArticle } from "@application/ports/INewsProvider.js";

const ASSET_TAGS = ["EUR", "USD", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD", "Gold", "Oil", "BTC", "ETH"];

@injectable()
export class NewsService {
  constructor(
    @inject("NewsRepository") private newsRepo: NewsRepository
  ) {}

  createAndTagArticle(raw: RawNewsArticle, category: string): NewsArticle {
    const text = `${raw.headline} ${raw.summary || ""}`.toLowerCase();
    const tags = new Set<string>();

    if (category === 'crypto' || raw.source.toLowerCase().includes("crypto") || /\b(btc|bitcoin|crypto|ethereum|eth)\b/.test(text)) {
      tags.add("btc");
    }
    if (/\b(usd|dollar|fed\b|fomc|federal reserve|greenback)\b/.test(text)) {
      tags.add("usd");
    }
    if (/\b(gold|silver|xau|xag|precious metal)\b/.test(text)) {
      tags.add("metal");
    }
    if (/\b(oil|wti|brent|crude)\b/.test(text)) {
      tags.add("oil");
    }

    if (tags.size === 0) {
      if (category === 'crypto' || raw.source.toLowerCase().includes("crypto")) {
        tags.add("crypto");
      } else if (category === 'forex' || raw.source.toLowerCase().includes("investing")) {
        tags.add("eco");
      } else {
        tags.add("global");
      }
    }

    return NewsArticle.create({
      source: raw.source,
      title: raw.headline,
      url: raw.url,
      summary: raw.summary,
      assetTags: Array.from(tags),
      publishedAt: raw.publishedAt
    });
  }

  async cleanupOldNews(days: number): Promise<number> {
    return this.newsRepo.cleanupOlderThan(days);
  }
}