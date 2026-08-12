import { env } from "@config/env";
import { logger } from "@core/logging/logger.js";

interface FinnhubQuoteResponse {
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
}

export class FinnhubClient {
  private cache = new Map<string, { data: { price: number; change: number; changePercent: number }; expires: number }>();
  private readonly CACHE_TTL = 60000; // 1 minute

  async fetchQuote(symbol: string): Promise<{ price: number; change: number; changePercent: number } | null> {
    if (!env.FINNHUB_API_KEY) return null;

    const cached = this.cache.get(symbol);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    try {
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${env.FINNHUB_API_KEY}`);
      if (!res.ok) throw new Error(`Finnhub error ${res.status}`);
      const data = await res.json() as FinnhubQuoteResponse;
      
      const result = {
        price: data.c,
        change: data.d,
        changePercent: data.dp,
      };
      
      this.cache.set(symbol, { data: result, expires: Date.now() + this.CACHE_TTL });
      return result;
    } catch (err) {
      logger.error("Finnhub fetch failed", { context: "Finnhub", symbol, error: (err as Error).message });
      return null;
    }
  }

  async fetchQuotes(symbols: string[]): Promise<Map<string, { price: number; change: number; changePercent: number }>> {
    const results = new Map();
    await Promise.all(symbols.map(async (symbol) => {
      const quote = await this.fetchQuote(symbol);
      if (quote) results.set(symbol, quote);
    }));
    return results;
  }
}