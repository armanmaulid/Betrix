import { env } from "@config/env";
import { logger } from "@core/logging/logger.js";
import { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";
import { CalendarEvent } from "@domain/entities/CalendarEvent.js";
import { SymbolRepository } from "@domain/repositories/SymbolRepository.js";
import { CalendarRepository } from "@domain/repositories/CalendarRepository.js";

export class Mt5Client {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_DELAY = 5000;

  private symbolRepo: SymbolRepository;
  private calendarRepo: CalendarRepository;

  constructor() {
    // Repositories will be injected via container
    this.symbolRepo = null as any;
    this.calendarRepo = null as any;
  }

  setRepositories(symbolRepo: SymbolRepository, calendarRepo: CalendarRepository) {
    this.symbolRepo = symbolRepo;
    this.calendarRepo = calendarRepo;
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
          // Handle price updates
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

  private async handleSymbols(data: any[]): Promise<void> {
    if (!this.symbolRepo) return;
    
    for (const s of data) {
      const symbol = new BrokerSymbol(
        s.symbol, s.description, s.path, s.category,
        s.trade_mode, s.is_active, new Date(), new Date()
      );
      await this.symbolRepo.save(symbol);
    }
  }

  private async handleCalendar(data: any[]): Promise<void> {
    if (!this.calendarRepo) return;
    
    for (const c of data) {
      const event = new CalendarEvent(
        c.value_id, c.event_id, new Date(c.event_time),
        c.country, c.currency, c.event_name,
        c.importance, c.actual, c.forecast, c.previous,
        new Date(), new Date()
      );
      await this.calendarRepo.save(event);
    }
  }

  async fetchSymbols(): Promise<BrokerSymbol[]> {
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

  async fetchCalendar(): Promise<CalendarEvent[]> {
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

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}