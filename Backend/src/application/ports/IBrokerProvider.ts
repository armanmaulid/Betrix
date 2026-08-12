import { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";

export interface PriceTick {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  digits: number;
  volume: number;
  timestamp: number;
}

export interface OHLCUpdate {
  symbol: string;
  timeframe: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  prev_close: number;
}

export interface MarketBookUpdate {
  symbol: string;
  bids: Array<{ price: number; volume: number }>;
  asks: Array<{ price: number; volume: number }>;
}

export interface CalendarUpdate {
  event_id: number;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

export interface TrackingStatus {
  price: boolean;
  ohlc: boolean;
  mbook: boolean;
  calendar: boolean;
  uptimeSec: number;
}

export interface BrokerCallbacks {
  onPriceTick?: (tick: PriceTick) => void;
  onOHLCUpdate?: (update: OHLCUpdate) => void;
  onMarketBookUpdate?: (update: MarketBookUpdate) => void;
  onCalendarUpdate?: (update: CalendarUpdate) => void;
  onReconnect?: () => void;
  onTrackingStatus?: (status: TrackingStatus) => void;
}

export interface IBrokerProvider {
  connect(): Promise<void>;
  disconnect(): void;
  setCallbacks(callbacks: BrokerCallbacks): void;
  
  trackPrices(symbols: string[]): Promise<void>;
  trackOHLC(requests: Array<{ symbol: string; timeframe: string; depth: number }>): Promise<void>;
  trackMarketBook(symbols: string[]): Promise<void>;
  trackCalendar(country?: string, currency?: string): Promise<void>;
  
  fetchSymbolCount(): Promise<number>;
  fetchSymbols(): Promise<BrokerSymbol[]>;
  fetchCalendar(period?: string): Promise<any[]>;
}
