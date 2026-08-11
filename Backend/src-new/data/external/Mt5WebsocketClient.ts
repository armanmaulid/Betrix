import { injectable, singleton } from "tsyringe";
import { env } from "@config/env.js";
import { logger } from "@core/logging/logger.js";
import { BrokerCallbacks } from "@application/ports/IBrokerProvider.js";

@injectable()
@singleton()
export class Mt5WebsocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_DELAY = 5000;

  private callbacks: BrokerCallbacks = {};

  setCallbacks(callbacks: BrokerCallbacks): void {
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(env.MT5_WS_URL || `ws://${env.MT5_BRIDGE_URL}`);
        
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
          const error = err instanceof Error ? err : new Error(`WebSocket error: ${err?.message || "Unknown error"}`);
          logger.debug("MT5 WebSocket error", { context: "MT5", error: error.message });
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
      logger.warn("Max MT5 reconnect attempts reached, stopping (HTTP API still works)", { context: "MT5" });
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.RECONNECT_DELAY * Math.min(this.reconnectAttempts, 5);
    logger.debug(`Reconnecting to MT5 in ${delay}ms (attempt ${this.reconnectAttempts})`, { context: "MT5" });
    setTimeout(() => {
      this.connect().catch(err => {
        logger.debug("MT5 reconnection failed", { context: "MT5", error: (err as Error).message });
      });
    }, delay);
  }

  private subscribeToSymbols(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ action: "subscribe", symbols: [] }));
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data);
      
      switch (msg.type) {
        case "price_update":
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
      }
    } catch (err) {
      logger.error("Failed to parse MT5 message", { context: "MT5", error: (err as Error).message });
    }
  }

  private handlePriceTick(msg: any): void {
    const tick = {
      symbol: msg.symbol,
      bid: msg.bid,
      ask: msg.ask,
      spread: msg.spread,
      digits: msg.digits,
      volume: msg.volume,
      timestamp: msg.timestamp || Date.now()
    };
    if (this.callbacks.onPriceTick) {
      this.callbacks.onPriceTick(tick);
    }
  }

  private handleOHLCUpdate(msg: any): void {
    if (!msg.bars || !Array.isArray(msg.bars) || msg.bars.length === 0) return;
    
    const latestBar = msg.bars[msg.bars.length - 1];
    const previousBar = msg.bars.length > 1 ? msg.bars[msg.bars.length - 2] : null;
    
    const update = {
      symbol: msg.symbol,
      timeframe: msg.timeframe,
      time: latestBar.time,
      open: latestBar.open,
      high: latestBar.high,
      low: latestBar.low,
      close: latestBar.close,
      volume: latestBar.volume,
      prev_close: previousBar ? previousBar.close : latestBar.open
    };

    if (this.callbacks.onOHLCUpdate) {
      this.callbacks.onOHLCUpdate(update);
    }
  }

  private handleMarketBookUpdate(msg: any): void {
    const bids: Array<{price: number, volume: number}> = [];
    const asks: Array<{price: number, volume: number}> = [];

    if (msg.market_book && Array.isArray(msg.market_book)) {
      for (const item of msg.market_book) {
        if (item.type === "BOOK_TYPE_BUY") {
          bids.push({ price: item.price, volume: item.volume });
        } else if (item.type === "BOOK_TYPE_SELL") {
          asks.push({ price: item.price, volume: item.volume });
        }
      }
    }

    const update = {
      symbol: msg.symbol,
      bids,
      asks
    };

    if (this.callbacks.onMarketBookUpdate) {
      this.callbacks.onMarketBookUpdate(update);
    }
  }

  private handleCalendarUpdate(msg: any): void {
    if (!msg.events || !Array.isArray(msg.events)) return;

    for (const event of msg.events) {
      const update = {
        event_id: event.event_id,
        actual: event.actual,
        forecast: event.forecast,
        previous: event.previous
      };

      if (this.callbacks.onCalendarUpdate) {
        this.callbacks.onCalendarUpdate(update);
      }
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
