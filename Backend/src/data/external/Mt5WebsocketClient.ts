import { injectable, singleton } from "tsyringe";
import { WebSocket } from "ws";
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

  // Status heartbeat watchdog. EA broadcasts a "tracking_status" message
  // every ~5s (see Data.mqh::SendTrackingStatus). If none arrives within
  // STATUS_STALE_TIMEOUT_MS, the EA is assumed dead even though the TCP
  // socket may still look open (covers non-graceful EA death: crash, kill,
  // terminal shutdown, where onclose can be delayed or never fire).
  private statusWatchdog: NodeJS.Timeout | null = null;
  private lastTrackingStatusAt = 0;
  private readonly STATUS_STALE_TIMEOUT_MS = 15000;
  private readonly STATUS_CHECK_INTERVAL_MS = 5000;

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
          this.startStatusWatchdog();
          this.callbacks.onReconnect?.();
          resolve();
        };

        this.ws.onmessage = (event) => this.handleMessage(event.data.toString());
        
        this.ws.onclose = () => {
          logger.warn("MT5 WebSocket disconnected", { context: "MT5" });
          this.stopStatusWatchdog();
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

  private startStatusWatchdog(): void {
    this.stopStatusWatchdog();
    this.lastTrackingStatusAt = Date.now(); // grace period sampai status pertama datang
    this.statusWatchdog = setInterval(() => {
      const staleFor = Date.now() - this.lastTrackingStatusAt;
      if (staleFor > this.STATUS_STALE_TIMEOUT_MS) {
        logger.warn(`No tracking_status from MT5 EA in ${staleFor}ms - assuming EA dead, forcing reconnect`, { context: "MT5" });
        this.ws?.close();
      }
    }, this.STATUS_CHECK_INTERVAL_MS);
  }

  private stopStatusWatchdog(): void {
    if (this.statusWatchdog) {
      clearInterval(this.statusWatchdog);
      this.statusWatchdog = null;
    }
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
        case "tracking_status":
          this.handleTrackingStatus(msg);
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

  private handleTrackingStatus(msg: any): void {
    this.lastTrackingStatusAt = Date.now();

    if (this.callbacks.onTrackingStatus) {
      this.callbacks.onTrackingStatus({
        price: !!msg.price,
        ohlc: !!msg.ohlc,
        mbook: !!msg.mbook,
        calendar: !!msg.calendar,
        uptimeSec: typeof msg.uptime_sec === "number" ? msg.uptime_sec : 0,
      });
    }
  }

  private handleCalendarUpdate(msg: any): void {
    if (!msg.events || !Array.isArray(msg.events)) return;

    for (const event of msg.events) {
      const update = {
        value_id: event.value_id,
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
    this.stopStatusWatchdog();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
