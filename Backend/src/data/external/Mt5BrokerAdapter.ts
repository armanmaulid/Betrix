import { inject, injectable, singleton } from "tsyringe";
import { IBrokerProvider, BrokerCallbacks, OHLCBar, Mt5CalendarEvent } from "@domain/ports/IBrokerProvider.js";
import { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";
import { Mt5HttpClient } from "./Mt5HttpClient.js";
import { Mt5WebsocketClient } from "./Mt5WebsocketClient.js";

@injectable()
@singleton()
export class Mt5BrokerAdapter implements IBrokerProvider {
  constructor(
    @inject("Mt5HttpClient") private httpClient: Mt5HttpClient,
    @inject("Mt5WebsocketClient") private wsClient: Mt5WebsocketClient
  ) {}

  setCallbacks(callbacks: BrokerCallbacks): void {
    this.wsClient.setCallbacks(callbacks);
  }

  async connect(): Promise<void> {
    return this.wsClient.connect();
  }

  disconnect(): void {
    this.wsClient.disconnect();
  }

  async trackPrices(symbols: string[]): Promise<void> {
    return this.httpClient.trackPrices(symbols);
  }

  async trackOHLC(requests: Array<{ symbol: string; timeframe: string; depth: number }>): Promise<void> {
    return this.httpClient.trackOHLC(requests);
  }

  async trackMarketBook(symbols: string[]): Promise<void> {
    return this.httpClient.trackMarketBook(symbols);
  }

  async trackCalendar(country?: string, currency?: string): Promise<void> {
    return this.httpClient.trackCalendar(country, currency);
  }

  async fetchSymbolCount(): Promise<number> {
    return this.httpClient.fetchSymbolCount();
  }

  async fetchSymbols(): Promise<BrokerSymbol[]> {
    return this.httpClient.fetchSymbols();
  }

  async fetchCalendar(period?: string): Promise<Mt5CalendarEvent[]> {
    return this.httpClient.fetchCalendar(period);
  }

  async fetchHistory(symbol: string, timeframe: string, fromDate: string, toDate: string): Promise<OHLCBar[]> {
    return this.httpClient.fetchHistory(symbol, timeframe, fromDate, toDate);
  }
}
