import { redisClient } from "@data/orm/redisClient.js";
import type { MarketDataRepository } from "@domain/repositories/MarketDataRepository.js";
import type { PriceTick, OHLCUpdate, MarketBookUpdate } from "@domain/ports/IBrokerProvider.js";
import { env } from "@config/env.js";
import { secondsUntilBrokerMidnight } from "@core/utils/date.js";

export class RedisMarketDataRepository implements MarketDataRepository {
  async cachePrice(tick: PriceTick): Promise<void> {
    const cacheKey = `mt5:price:${tick.symbol}`;
    await redisClient.setex(cacheKey, 60, tick); // 60s TTL
  }

  async cacheOHLC(update: OHLCUpdate): Promise<void> {
    const cacheKey = `mt5:ohlc:${update.symbol}:${update.timeframe}`;
    
    // For D1 timeframe, TTL should expire precisely at broker midnight
    // For other timeframes, we can just use 24h as a fallback
    const ttl = update.timeframe === "D1" 
      ? secondsUntilBrokerMidnight(env.MT5_BROKER_UTC_OFFSET)
      : 86400;
      
    await redisClient.setex(cacheKey, Math.max(ttl, 60), update);
  }

  async cacheMarketBook(update: MarketBookUpdate): Promise<void> {
    const cacheKey = `mt5:mbook:${update.symbol}`;
    await redisClient.setex(cacheKey, 60, update); // 60s TTL
  }

  async getPrice(symbol: string): Promise<PriceTick | null> {
    const data = await redisClient.get<unknown>(`mt5:price:${symbol}`);
    return data ? (typeof data === 'string' ? (JSON.parse(data) as PriceTick) : (data as PriceTick)) : null;
  }

  async getAllPrices(pattern: string = "mt5:price:*"): Promise<PriceTick[]> {
    const keys = await redisClient.keys(pattern);
    if (keys.length === 0) return [];

    const prices: PriceTick[] = [];
    for (const key of keys) {
      const data = await redisClient.get<unknown>(key);
      if (data) {
        prices.push(typeof data === 'string' ? (JSON.parse(data) as PriceTick) : (data as PriceTick));
      }
    }
    return prices;
  }

  async getOHLC(symbol: string, timeframe: string): Promise<OHLCUpdate | null> {
    const data = await redisClient.get<unknown>(`mt5:ohlc:${symbol}:${timeframe}`);
    return data ? (typeof data === 'string' ? (JSON.parse(data) as OHLCUpdate) : (data as OHLCUpdate)) : null;
  }

  async getAllOHLC(pattern: string): Promise<OHLCUpdate[]> {
    const keys = await redisClient.keys(pattern);
    if (keys.length === 0) return [];

    const ohlc: OHLCUpdate[] = [];
    for (const key of keys) {
      const data = await redisClient.get<unknown>(key);
      if (data) {
        ohlc.push(typeof data === 'string' ? (JSON.parse(data) as OHLCUpdate) : (data as OHLCUpdate));
      }
    }
    return ohlc;
  }

  async getMarketBook(symbol: string): Promise<MarketBookUpdate | null> {
    const data = await redisClient.get<unknown>(`mt5:mbook:${symbol}`);
    return data ? (typeof data === 'string' ? (JSON.parse(data) as MarketBookUpdate) : (data as MarketBookUpdate)) : null;
  }

  async getAllMarketBooks(pattern: string = "mt5:mbook:*"): Promise<MarketBookUpdate[]> {
    const keys = await redisClient.keys(pattern);
    if (keys.length === 0) return [];

    const books: MarketBookUpdate[] = [];
    for (const key of keys) {
      const data = await redisClient.get<unknown>(key);
      if (data) {
        books.push(typeof data === 'string' ? (JSON.parse(data) as MarketBookUpdate) : (data as MarketBookUpdate));
      }
    }
    return books;
  }
}
