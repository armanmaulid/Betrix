import { injectable, singleton } from "tsyringe";
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

@injectable()
@singleton()
export class Mt5Client {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_DELAY = 5000;

  private symbolRepo: any;
  private calendarRepo: any;

  // Callbacks for real-time data
  private onPriceTick: ((tick: any) => void) | null = null;
  private onOHLCUpdate: ((update: any) => void) | null = null;
  private onMarketBookUpdate: ((update: any) => void) | null = null;
  private onCalendarUpdate: ((update: any) => void) | null = null;

  constructor() {
    this.symbolRepo = null;
    this.calendarRepo = null;
  }

  setRepositories(symbolRepo: any, calendarRepo: any) {
    this.symbolRepo = symbolRepo;
    this.calendarRepo = calendarRepo;
  }

  setCallbacks(callbacks: {
    onPriceTick?: (tick: any) => void;
    onOHLCUpdate?: (update: any) => void;
    onMarketBookUpdate?: (update: any) => void;
    onCalendarUpdate?: (update: any) => void;
  }) {
    this.onPriceTick = callbacks.onPriceTick || null;
    this.onOHLCUpdate = callbacks.onOHLCUpdate || null;
    this.onMarketBookUpdate = callbacks.onMarketBookUpdate || null;
    this.onCalendarUpdate = callbacks.onCalendarUpdate || null;
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const wsUrl = env.MT5_WS_URL || `ws://${env.MT5_BRIDGE_URL}`;
    
    return new Promise((resolve, reject) => {
      try {
        // EA expects "Sec-WebSocket-Key" (capitalized) not "sec-websocket-key" (lowercase)
        // Node's ws library sends lowercase by default; override with correct case
        this.ws = new WebSocket(env.MT5_WS_URL || `ws://${env.MT5_BRIDGE_URL}`, {
          headers: {
            "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", // placeholder; ws lib will replace with real key
            "Sec-WebSocket-Version": "13",
            "Connection": "Upgrade",
            "Upgrade": "websocket",
          },
        });
        
        this.ws.onopen = () => {
          logger.info("MT5 WebSocket connected", { context: "MT5" });
          this.reconnectAttempts = 0;
          this.subscribeToSymbols();
          resolve();
        };

        this.ws.onmessage = (event) => this.handleMessage(event.data);
        
        this.ws.onclose = () => {
          logger.warn("MT5 WebSocket disconnected", { context: "MT5" });
          this.scheduleReconnect();
        };

        this.ws.onerror = (err) => {
          // ErrorEvent is not an Error - convert to proper Error for rejection
          const error = err instanceof Error ? err : new Error(`WebSocket error: ${err?.message || "Unknown error"}`);
          logger.error("MT5 WebSocket error", { context: "MT5", error: error.message });
          reject(error);
        };
      } catch (err) {
        logger.error("Failed to connect to MT5", { context: "MT5", error: (err as Error).message });
        this.scheduleReconnect();
        reject(err);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logger.error("Max MT5 reconnect attempts reached", { context: "MT5" });
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.RECONNECT_DELAY * Math.min(this.reconnectAttempts, 5);
    logger.info(`Reconnecting to MT5 in ${delay}ms (attempt ${this.reconnectAttempts})`, { context: "MT5" });
    setTimeout(() => {
      this.connect().catch(err => {
        logger.error("MT5 reconnection failed", { context: "MT5", error: (err as Error).message });
      });
    }, delay);
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
        case "price_update": // Fixed: was "tick", now matches EA protocol
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
        // Removed "symbols" and "calendar" cases - these are now handled via HTTP
      }
    } catch (err) {
      logger.error("Failed to parse MT5 message", { context: "MT5", error: (err as Error).message });
    }
  }

  private async handlePriceTick(msg: any): Promise<void> {
    const tick = {
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
    const update = {
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
    const update = {
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
    const update = {
      event_id: msg.event_id,
      actual: msg.actual,
      forecast: msg.forecast,
      previous: msg.previous
    };

    if (this.onCalendarUpdate) {
      this.onCalendarUpdate(update);
    }
  }

  // HTTP-based tracking subscriptions (not WebSocket)
  private getHttpBase(): string {
    return env.MT5_HTTP_URL || `http://${env.MT5_BRIDGE_URL}`;
  }

  async trackPrices(symbols: string[]): Promise<void> {
    const response = await fetch(`${this.getHttpBase()}/v1/track/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols }),
    });
    if (!response.ok) {
      throw new Error(`Failed to track prices: ${response.statusText}`);
    }
  }

  async trackOHLC(requests: Array<{ symbol: string; timeframe: string; depth: number }>): Promise<void> {
    const response = await fetch(`${this.getHttpBase()}/v1/track/ohlc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ohlc: requests.map(r => ({ symbol: r.symbol, time_frame: r.timeframe, depth: r.depth })),
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to track OHLC: ${response.statusText}`);
    }
  }

  async trackMarketBook(symbols: string[]): Promise<void> {
    const response = await fetch(`${this.getHttpBase()}/v1/track/mbook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols }),
    });
    if (!response.ok) {
      throw new Error(`Failed to track market book: ${response.statusText}`);
    }
  }

  async trackCalendar(country?: string, currency?: string): Promise<void> {
    const response = await fetch(`${this.getHttpBase()}/v1/track/calendar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: country || "", currency: currency || "" }),
    });
    if (!response.ok) {
      throw new Error(`Failed to track calendar: ${response.statusText}`);
    }
  }

  // REST API methods for fetching data
  private async fetchWithRetry<T>(url: string, maxRetries = 3, baseDelay = 2000): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json() as T;
      } catch (err) {
        logger.warn(`Request failed (attempt ${attempt}/${maxRetries})`, { context: "MT5", url, error: (err as Error).message });
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, baseDelay * attempt));
        }
      }
    }
    throw new Error(`Failed after ${maxRetries} retries: ${url}`);
  }

  async fetchSymbolCount(): Promise<number> {
    const data = await this.fetchWithRetry<{ count: number }>(`${this.getHttpBase()}/v1/symbol/count`);
    return data.count;
  }

  async fetchSymbols(): Promise<any[]> {
    // Retry with backoff for slow EA symbol list generation
    const maxRetries = 3;
    const baseDelay = 2000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.getHttpBase()}/v1/symbol/list`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json() as any[];
        
        if (data.length > 0) {
          return data;
        }
        
        logger.warn(`fetchSymbols returned empty array (attempt ${attempt}/${maxRetries})`, { context: "MT5" });
      } catch (err) {
        logger.warn(`fetchSymbols attempt ${attempt}/${maxRetries} failed`, { context: "MT5", error: (err as Error).message });
      }
      
      if (attempt < maxRetries) {
        const delay = baseDelay * attempt;
        logger.info(`Retrying fetchSymbols in ${delay}ms...`, { context: "MT5" });
        await new Promise(r => setTimeout(r, delay));
      }
    }
    
    logger.error("fetchSymbols failed after all retries", { context: "MT5" });
    return [];
  }

  async fetchCalendar(period = "today"): Promise<any[]> {
    const data = await this.fetchWithRetry<any>(`${this.getHttpBase()}/v1/calendar?period=${period}`);
    return Array.isArray(data) ? data : (data && typeof data === 'object' && 'data' in data ? (data as { data?: any[] }).data ?? [] : []);
  }

  async getPrice(symbol: string) {
    const cacheKey = `mt5:price:${symbol}`;
    const data = await redisClient.get<string | null>(cacheKey);
    if (data) return JSON.parse(data);
    return null;
  }

  async getOHLC(symbol: string, timeframe: string) {
    const cacheKey = `mt5:ohlc:${symbol}:${timeframe}`;
    const data = await redisClient.get<string | null>(cacheKey);
    if (data) return JSON.parse(data);
    return null;
  }

  async getMarketBook(symbol: string) {
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