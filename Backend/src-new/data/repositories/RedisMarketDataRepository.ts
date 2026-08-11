import { redisClient } from "@data/orm/redisClient.js";
import { MarketDataRepository } from "@domain/repositories/MarketDataRepository.js";
import { PriceTick, OHLCUpdate, MarketBookUpdate } from "@application/ports/IBrokerProvider.js";

export class RedisMarketDataRepository implements MarketDataRepository {
  async cachePrice(tick: PriceTick): Promise<void> {
    const cacheKey = `mt5:price:${tick.symbol}`;
    await redisClient.setex(cacheKey, 60, JSON.stringify(tick)); // 60s TTL
  }

  async cacheOHLC(update: OHLCUpdate): Promise<void> {
    const cacheKey = `mt5:ohlc:${update.symbol}:${update.timeframe}`;
    await redisClient.setex(cacheKey, 300, JSON.stringify(update)); // 5min TTL
  }

  async cacheMarketBook(update: MarketBookUpdate): Promise<void> {
    const cacheKey = `mt5:mbook:${update.symbol}`;
    await redisClient.setex(cacheKey, 60, JSON.stringify(update)); // 60s TTL
  }

  async getPrice(symbol: string): Promise<PriceTick | null> {
    const data = await redisClient.get<string | null>(`mt5:price:${symbol}`);
    return data ? JSON.parse(data) : null;
  }

  async getAllPrices(pattern: string = "mt5:price:*"): Promise<PriceTick[]> {
    const keys = await redisClient.keys(pattern);
    if (keys.length === 0) return [];

    const prices: PriceTick[] = [];
    for (const key of keys) {
      const data = await redisClient.get<string | null>(key);
      if (data) {
        prices.push(JSON.parse(data));
      }
    }
    return prices;
  }

  async getOHLC(symbol: string, timeframe: string): Promise<OHLCUpdate | null> {
    const data = await redisClient.get<string | null>(`mt5:ohlc:${symbol}:${timeframe}`);
    return data ? JSON.parse(data) : null;
  }

  async getAllOHLC(pattern: string): Promise<OHLCUpdate[]> {
    const keys = await redisClient.keys(pattern);
    if (keys.length === 0) return [];

    const ohlc: OHLCUpdate[] = [];
    for (const key of keys) {
      const data = await redisClient.get<string | null>(key);
      if (data) {
        ohlc.push(JSON.parse(data));
      }
    }
    return ohlc;
  }

  async getMarketBook(symbol: string): Promise<MarketBookUpdate | null> {
    const data = await redisClient.get<string | null>(`mt5:mbook:${symbol}`);
    return data ? JSON.parse(data) : null;
  }

  async getAllMarketBooks(pattern: string = "mt5:mbook:*"): Promise<MarketBookUpdate[]> {
    const keys = await redisClient.keys(pattern);
    if (keys.length === 0) return [];

    const books: MarketBookUpdate[] = [];
    for (const key of keys) {
      const data = await redisClient.get<string | null>(key);
      if (data) {
        books.push(JSON.parse(data));
      }
    }
    return books;
  }
}
