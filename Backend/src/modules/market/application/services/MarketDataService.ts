import { inject, injectable } from "tsyringe";
import { MarketDataRepository } from "@domain/repositories/MarketDataRepository.js";
import { SymbolRepository } from "@domain/repositories/SymbolRepository.js";
import type { AppSettings } from "@core/settings/AppSettings.js";
import { INotifier } from "@domain/ports/INotifier.js";
import { IBrokerProvider, OHLCUpdate, MarketBookUpdate } from "@domain/ports/IBrokerProvider.js";

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
    @inject("INotifier") private notifier: INotifier,
    @inject("IBrokerProvider") private brokerClient: IBrokerProvider,
    @inject("AppSettings") private settings: AppSettings
  ) {}

  // Minutes per bar per timeframe. Used to compute a date range wide enough
  // to cover ~100 bars (with 1.5x buffer for holidays/weekends gaps).
  private static readonly TF_MINUTES: Record<string, number> = {
    M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440, W1: 10080, MN1: 43200,
  };

  // Format a Date (holding broker wall-clock in its UTC fields) as
  // `YYYY-MM-DDTHH:MM:SS` (len 19). MT5 bridge validates exactly this shape
  // (rejects `.000Z`/len 24 and date-only is fine but truncates the day).
  private static toBrokerIso(date: Date): string {
    const p = (n: number) => n.toString().padStart(2, "0");
    return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}` +
      `T${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())}`;
  }

  private dateRangeFor(timeframe: string): { fromDate: string; toDate: string } {
    const minutes = MarketDataService.TF_MINUTES[timeframe] ?? 1440;
    const bufferMs = minutes * 60 * 1000 * 100 * 1.5;
    const offsetMs = this.settings.brokerUtcOffset * 3600 * 1000;
    const brokerNow = new Date(Date.now() + offsetMs);

    // Market closed on broker Sat/Sun — snap the window to Friday close so
    // CopyRates returns the last real bars instead of an empty fallback.
    const dow = brokerNow.getUTCDay();
    const to = new Date(brokerNow);
    if (dow === 6 || dow === 0) {
      to.setUTCDate(to.getUTCDate() - (dow === 6 ? 1 : 2));
      to.setUTCHours(23, 59, 0, 0);
    }

    const from = new Date(to.getTime() - bufferMs);
    return {
      fromDate: MarketDataService.toBrokerIso(from),
      toDate: MarketDataService.toBrokerIso(to),
    };
  }

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

  async getOHLC(symbol: string, timeframe: string): Promise<OHLCData[]> {
    const { fromDate, toDate } = this.dateRangeFor(timeframe);
    const bars = await this.brokerClient.fetchHistory(symbol, timeframe, fromDate, toDate);
    return bars.map(b => ({
      symbol,
      timeframe,
      time: Math.floor(new Date(b.time).getTime() / 1000),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));
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

  async getAllOHLC(timeframe: string): Promise<OHLCUpdate[]> {
    return this.marketDataRepo.getAllOHLC(`mt5:ohlc:*:${timeframe}`);
  }

  async getAllMarketBooks(): Promise<MarketBookUpdate[]> {
    return this.marketDataRepo.getAllMarketBooks();
  }

  async handlePriceTick(tick: { symbol: string; bid: number; ask: number; spread: number; digits: number; volume: number; timestamp: number }): Promise<void> {
    if (this.settings.trackPrices && this.settings.trackingSymbols.includes(tick.symbol)) {
      this.notifier.broadcastGlobal("price_update", tick);
    }
  }

  async handleOHLCUpdate(update: { symbol: string; timeframe: string; time: number; open: number; high: number; low: number; close: number; volume: number; prev_close?: number }): Promise<void> {
    const ohlcUpdate = {
      ...update,
      prev_close: update.prev_close ?? update.open
    };

    if (this.settings.trackOhlc && this.settings.trackingSymbols.includes(update.symbol)) {
      if (update.timeframe === "D1") {
        await this.marketDataRepo.cacheOHLC(ohlcUpdate);
      }
      this.notifier.broadcastGlobal("ohlc_update", ohlcUpdate);
    }
  }

  async handleMarketBookUpdate(update: { symbol: string; bids: Array<{ price: number; volume: number }>; asks: Array<{ price: number; volume: number }> }): Promise<void> {
    if (this.settings.trackMbook && this.settings.trackingSymbols.includes(update.symbol)) {
      this.notifier.broadcastGlobal("mbook_update", update);
    }
  }
}