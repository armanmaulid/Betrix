import { env } from "@config/env";
import { logger } from "@core/logging/logger.js";
import { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";
import { CalendarEvent } from "@domain/entities/CalendarEvent.js";
import { SymbolRepository } from "@domain/repositories/SymbolRepository.js";
import { CalendarRepository } from "@domain/repositories/CalendarRepository.js";
import { redisClient } from "../orm/redisClient.js";

interface PriceTick {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  digits: number;
  volume: number;
  timestamp: number;
}

interface OHLCUpdate {
  symbol: string;
  timeframe: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MarketBookUpdate {
  symbol: string;
  bids: Array<{ price: number; volume: number }>;
  asks: Array<{ price: number; volume: number }>;
}

interface CalendarUpdate {
  event_id: number;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

export class Mt5Client {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_DELAY = 5000;

  private symbolRepo: any;
  private calendarRepo: any;

  // Callbacks for real-time data
  private onPriceTick: ((tick: PriceTick) => void) | null = null;
  private onOHLCUpdate: ((update: OHLCUpdate) => void) | null = null;
  private onMarketBookUpdate: ((update: MarketBookUpdate) => void) | null = null;
  private onCalendarUpdate: ((update: CalendarUpdate) => void) | null = null;

  constructor() {
    this.symbolRepo = null;
    this.calendarRepo = null;
  }

  setRepositories(symbolRepo: any, calendarRepo: any) {
    this.symbolRepo = symbolRepo;
    this.calendarRepo = calendarRepo;
  }

  setCallbacks(callbacks: {
    onPriceTick?: (tick: PriceTick) => void;
    onOHLCUpdate?: (update: OHLCUpdate) => void;
    onMarketBookUpdate?: (update: MarketBookUpdate) => void;
    onCalendarUpdate?: (update: CalendarUpdate) => void;
  }) {
    this.onPriceTick = callbacks.onPriceTick || null;
    this.onOHLCUpdate = callbacks.onOHLCUpdate || null;
    this.onMarketBookUpdate = callbacks.onMarketBookUpdate || null;
    this.onCalendarUpdate = callbacks.onCalendarUpdate || null;
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const wsUrl = env.MT5_WS_URL || `ws://${env.MT5_BRIDGE_URL}`;
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        logger.info("MT5 WebSocket connected", { context: "MT5" });
        this.reconnectAttempts = 0;
        this.subscribeToSymbols();
      };

      this.ws.onmessage = (event) => this.handleMessage(event.data);
      
      this.ws.onclose = () => {
        logger.warn("MT5 WebSocket disconnected", { context: "MT5" });
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        logger.error("MT5 WebSocket error", { context: "MT5", error: err });
      };
    } catch (err) {
      logger.error("Failed to connect to MT5", { context: "MT5", error: (err as Error).message });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logger.error("Max MT5 reconnect attempts reached", { context: "MT5" });
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.RECONNECT_DELAY * Math.min(this.reconnectAttempts, 5);
    logger.info(`Reconnecting to MT5 in ${delay}ms (attempt ${this.reconnectAttempts})`, { context: "MT5" });
    setTimeout(() => this.connect(), delay);
  }

  private subscribeToSymbols(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    // Subscribe to all active symbols
    this.ws.send(JSON.stringify({ action: "subscribe", symbols: [] }));
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data);
      
      switch (msg.type) {
        case "tick":
          this.handlePriceTick(msg);
          break;
        case "ohlc_update":
          this.handleOHLCUpdate(msg);
          break;
        case "track_mbook":
          this.handleMarketBookUpdate(msg);
          break;
        case "calendar_update":
          this.handleCalendarUpdate(msg);
          break;
        case "symbols":
          this.handleSymbols(msg.data);
          break;
        case "calendar":
          this.handleCalendar(msg.data);
          break;
      }
    } catch (err) {
      logger.error("Failed to parse MT5 message", { context: "MT5", error: (err as Error).message });
    }
  }

  private async handlePriceTick(msg: any): Promise<void> {
    const tick: PriceTick = {
      symbol: msg.symbol,
      bid: msg.bid,
      ask: msg.ask,
      spread: msg.spread,
      digits: msg.digits,
      volume: msg.volume,
      timestamp: msg.timestamp || Date.now()
    };

    // Cache in Redis for fast access
    const cacheKey = `mt5:price:${tick.symbol}`;
    await redisClient.setex(cacheKey, 60, JSON.stringify(tick)); // 60s TTL

    // Fire callback
    if (this.onPriceTick) {
      this.onPriceTick(tick);
    }
  }

  private async handleOHLCUpdate(msg: any): Promise<void> {
    const update: OHLCUpdate = {
      symbol: msg.symbol,
      timeframe: msg.timeframe,
      time: msg.time,
      open: msg.open,
      high: msg.high,
      low: msg.low,
      close: msg.close,
      volume: msg.volume
    };

    // Cache in Redis
    const cacheKey = `mt5:ohlc:${update.symbol}:${update.timeframe}`;
    await redisClient.setex(cacheKey, 300, JSON.stringify(update)); // 5min TTL

    if (this.onOHLCUpdate) {
      this.onOHLCUpdate(update);
    }
  }

  private async handleMarketBookUpdate(msg: any): Promise<void> {
    const update: MarketBookUpdate = {
      symbol: msg.symbol,
      bids: msg.bids || [],
      asks: msg.asks || []
    };

    // Cache in Redis
    const cacheKey = `mt5:mbook:${update.symbol}`;
    await redisClient.setex(cacheKey, 60, JSON.stringify(update)); // 60s TTL

    if (this.onMarketBookUpdate) {
      this.onMarketBookUpdate(update);
    }
  }

  private async handleCalendarUpdate(msg: any): Promise<void> {
    const update: CalendarUpdate = {
      event_id: msg.event_id,
      actual: msg.actual,
      forecast: msg.forecast,
      previous: msg.previous
    };

    if (this.onCalendarUpdate) {
      this.onCalendarUpdate(update);
    }
  }

  private async handleSymbols(data: any[]): Promise<void> {
    if (!this.symbolRepo) return;
    
    for (const s of data) {
      const symbol = {
        symbol: s.symbol,
        description: s.description,
        path: s.path,
        category: s.category,
        trade_mode: s.trade_mode,
        is_active: s.is_active,
        created_at: new Date(),
        updated_at: new Date()
      };
      await this.symbolRepo.save(symbol);
    }
  }

  private async handleCalendar(data: any[]): Promise<void> {
    if (!this.calendarRepo) return;
    
    for (const c of data) {
      const event = {
        value_id: c.value_id,
        event_id: c.event_id,
        event_time: new Date(c.event_time),
        country: c.country,
        currency: c.currency,
        event_name: c.event_name,
        importance: c.importance,
        actual: c.actual,
        forecast: c.forecast,
        previous: c.previous,
        created_at: new Date(),
        updated_at: new Date()
      };
      await this.calendarRepo.save(event);
    }
  }

  // REST API methods for tracking subscriptions
  async trackPrices(symbols: string[]): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ action: "track_prices", symbols }));
  }

  async trackOHLC(requests: Array<{ symbol: string; timeframe: string; depth: number }>): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ action: "track_ohlc", ohlc: requests }));
  }

  async trackMarketBook(symbols: string[]): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ action: "track_mbook", symbols }));
  }

  async trackCalendar(country?: string, currency?: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ 
      action: "track_calendar", 
      country: country || "", 
      currency: currency || "" 
    }));
  }

  // REST API methods for fetching data
  async fetchSymbols(): Promise<any[]> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return [];
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve([]), 5000);
      const handler = (event: MessageEvent) => {
        clearTimeout(timeout);
        this.ws?.removeEventListener("message", handler);
        try {
          const msg = JSON.parse(event.data.toString());
          if (msg.type === "symbols") resolve(msg.data);
        } catch {}
      };
      this.ws!.addEventListener("message", handler, { once: true });
      this.ws!.send(JSON.stringify({ action: "get_symbols" }));
    });
  }

  async fetchCalendar(): Promise<any[]> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return [];
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve([]), 5000);
      const handler = (event: MessageEvent) => {
        clearTimeout(timeout);
        this.ws?.removeEventListener("message", handler);
        try {
          const msg = JSON.parse(event.data.toString());
          if (msg.type === "calendar") resolve(msg.data);
        } catch {}
      };
      this.ws!.addEventListener("message", handler, { once: true });
      this.ws!.send(JSON.stringify({ action: "get_calendar" }));
    });
  }

  async getPrice(symbol: string): Promise<PriceTick | null> {
    const cacheKey = `mt5:price:${symbol}`;
    const data = await redisClient.get<string | null>(cacheKey);
    if (data) return JSON.parse(data);
    return null;
  }

  async getOHLC(symbol: string, timeframe: string): Promise<OHLCUpdate | null> {
    const cacheKey = `mt5:ohlc:${symbol}:${timeframe}`;
    const data = await redisClient.get<string | null>(cacheKey);
    if (data) return JSON.parse(data);
    return null;
  }

  async getMarketBook(symbol: string): Promise<MarketBookUpdate | null> {
    const cacheKey = `mt5:mbook:${symbol}`;
    const data = await redisClient.get<string | null>(cacheKey);
    if (data) return JSON.parse(data);
    return null;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}