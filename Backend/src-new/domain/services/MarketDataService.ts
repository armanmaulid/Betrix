import { inject, injectable } from "tsyringe";
import { redisClient } from "@data/orm/redisClient.js";
import { SymbolRepository } from "@domain/repositories/SymbolRepository.js";
import { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";
import { logger } from "@core/logging/logger.js";

interface PriceData {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  digits: number;
  volume: number;
  timestamp: number;
}

interface OHLCData {
  symbol: string;
  timeframe: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MarketBookData {
  symbol: string;
  bids: Array<{ price: number; volume: number }>;
  asks: Array<{ price: number; volume: number }>;
}

interface SymbolInfo {
  symbol: string;
  description: string | null;
  path: string | null;
  category: string | null;
  tradeMode: number;
  isActive: boolean;
}

@injectable()
export class MarketDataService {
  constructor(
    @inject("SymbolRepository") private symbolRepo: SymbolRepository
  ) {}

  async getPrice(symbol: string): Promise<PriceData | null> {
    const cacheKey = `mt5:price:${symbol}`;
    const data = await redisClient.get<string | null>(cacheKey);
    if (data) return JSON.parse(data);
    return null;
  }

  async getPrices(symbols: string[]): Promise<Map<string, PriceData>> {
    const results = new Map<string, PriceData>();
    await Promise.all(symbols.map(async (symbol) => {
      const price = await this.getPrice(symbol);
      if (price) results.set(symbol, price);
    }));
    return results;
  }

  async getOHLC(symbol: string, timeframe: string): Promise<OHLCData | null> {
    const cacheKey = `mt5:ohlc:${symbol}:${timeframe}`;
    const data = await redisClient.get<string | null>(cacheKey);
    if (data) return JSON.parse(data);
    return null;
  }

  async getMarketBook(symbol: string): Promise<MarketBookData | null> {
    const cacheKey = `mt5:mbook:${symbol}`;
    const data = await redisClient.get<string | null>(cacheKey);
    if (data) return JSON.parse(data);
    return null;
  }

  async getSymbols(activeOnly = true): Promise<SymbolInfo[]> {
    const symbols = activeOnly 
      ? await this.symbolRepo.findActive()
      : await this.symbolRepo.findAll();
    
    return symbols.map(s => ({
      symbol: s.symbol,
      description: s.description,
      path: s.path,
      category: s.category,
      tradeMode: s.tradeMode,
      isActive: s.isActive
    }));
  }

  async getSymbolInfo(symbol: string): Promise<SymbolInfo | null> {
    const symbolEntity = await this.symbolRepo.findById(symbol);
    if (!symbolEntity) return null;
    return {
      symbol: symbolEntity.symbol,
      description: symbolEntity.description,
      path: symbolEntity.path,
      category: symbolEntity.category,
      tradeMode: symbolEntity.tradeMode,
      isActive: symbolEntity.isActive
    };
  }

  async getSymbolsByCategory(category: string): Promise<SymbolInfo[]> {
    const symbols = await this.symbolRepo.findByCategory(category);
    return symbols.map(s => ({
      symbol: s.symbol,
      description: s.description,
      path: s.path,
      category: s.category,
      tradeMode: s.tradeMode,
      isActive: s.isActive
    }));
  }

  async getAllPrices(): Promise<PriceData[]> {
    const keys = await redisClient.keys("mt5:price:*");
    const prices: PriceData[] = [];
    
    for (const key of keys) {
      const data = await redisClient.get<string | null>(key);
      if (data) {
        prices.push(JSON.parse(data));
      }
    }
    return prices;
  }

  async getAllOHLC(timeframe: string): Promise<any[]> {
    const pattern = `mt5:ohlc:*:${timeframe}`;
    const keys = await redisClient.keys(pattern);
    const ohlc: any[] = [];
    
    for (const key of keys) {
      const data = await redisClient.get<string | null>(key);
      if (data) {
        ohlc.push(JSON.parse(data));
      }
    }
    return ohlc;
  }

  async getAllMarketBooks(): Promise<any[]> {
    const keys = await redisClient.keys("mt5:mbook:*");
    const books: any[] = [];
    
    for (const key of keys) {
      const data = await redisClient.get<string | null>(key);
      if (data) {
        books.push(JSON.parse(data));
      }
    }
    return books;
  }

  async handlePriceTick(tick: { symbol: string; bid: number; ask: number; spread: number; digits: number; volume: number; timestamp: number }): Promise<void> {
    const cacheKey = `mt5:price:${tick.symbol}`;
    await redisClient.setex(cacheKey, 60, JSON.stringify(tick));
  }

  async handleOHLCUpdate(update: { symbol: string; timeframe: string; time: number; open: number; high: number; low: number; close: number; volume: number }): Promise<void> {
    const cacheKey = `mt5:ohlc:${update.symbol}:${update.timeframe}`;
    await redisClient.setex(cacheKey, 300, JSON.stringify(update));
  }

  async handleMarketBookUpdate(update: { symbol: string; bids: Array<{ price: number; volume: number }>; asks: Array<{ price: number; volume: number }> }): Promise<void> {
    const cacheKey = `mt5:mbook:${update.symbol}`;
    await redisClient.setex(cacheKey, 60, JSON.stringify(update));
  }
}