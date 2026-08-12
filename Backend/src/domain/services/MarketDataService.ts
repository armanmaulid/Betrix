import { inject, injectable } from "tsyringe";
import { MarketDataRepository } from "@domain/repositories/MarketDataRepository.js";
import { SymbolRepository } from "@domain/repositories/SymbolRepository.js";
import { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";
import { logger } from "@core/logging/logger.js";
import { env } from "@config/env.js";
import { INotifier } from "@application/ports/INotifier.js";

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
  isActive: boolean;
}

@injectable()
export class MarketDataService {
  constructor(
    @inject("MarketDataRepository") private marketDataRepo: MarketDataRepository,
    @inject("SymbolRepository") private symbolRepo: SymbolRepository,
    @inject("INotifier") private notifier: INotifier
  ) {}

  async getPrice(symbol: string): Promise<PriceData | null> {
    const data = await this.marketDataRepo.getPrice(symbol);
    return data || null;
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
    const data = await this.marketDataRepo.getOHLC(symbol, timeframe);
    return data || null;
  }

  async getMarketBook(symbol: string): Promise<MarketBookData | null> {
    const data = await this.marketDataRepo.getMarketBook(symbol);
    return data || null;
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
      isActive: s.isActive
    }));
  }

  async getAllPrices(): Promise<PriceData[]> {
    return this.marketDataRepo.getAllPrices();
  }

  async getAllOHLC(timeframe: string): Promise<any[]> {
    return this.marketDataRepo.getAllOHLC(timeframe);
  }

  async getAllMarketBooks(): Promise<any[]> {
    return this.marketDataRepo.getAllMarketBooks();
  }

  async handlePriceTick(tick: { symbol: string; bid: number; ask: number; spread: number; digits: number; volume: number; timestamp: number }): Promise<void> {
    await this.marketDataRepo.cachePrice(tick);
    
    if (env.MT5_TRACK_PRICES && env.MT5_TRACKING_SYMBOLS.includes(tick.symbol)) {
      this.notifier.broadcastGlobal("price_update", tick);
    }
  }

  async handleOHLCUpdate(update: { symbol: string; timeframe: string; time: number; open: number; high: number; low: number; close: number; volume: number; prev_close?: number }): Promise<void> {
    const ohlcUpdate = {
      ...update,
      prev_close: update.prev_close ?? update.open
    };
    await this.marketDataRepo.cacheOHLC(ohlcUpdate);
    
    if (env.MT5_TRACK_OHLC && env.MT5_TRACKING_SYMBOLS.includes(update.symbol)) {
      this.notifier.broadcastGlobal("ohlc_update", ohlcUpdate);
    }
  }

  async handleMarketBookUpdate(update: { symbol: string; bids: Array<{ price: number; volume: number }>; asks: Array<{ price: number; volume: number }> }): Promise<void> {
    await this.marketDataRepo.cacheMarketBook(update);
    
    if (env.MT5_TRACK_MBOOK && env.MT5_TRACKING_SYMBOLS.includes(update.symbol)) {
      this.notifier.broadcastGlobal("mbook_update", update);
    }
  }
}