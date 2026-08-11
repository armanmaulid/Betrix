import { PriceTick, OHLCUpdate, MarketBookUpdate } from "@application/ports/IBrokerProvider.js";

export interface MarketDataRepository {
  // Write (cache operations)
  cachePrice(tick: PriceTick): Promise<void>;
  cacheOHLC(update: OHLCUpdate): Promise<void>;
  cacheMarketBook(update: MarketBookUpdate): Promise<void>;

  // Read operations
  getPrice(symbol: string): Promise<PriceTick | null>;
  getAllPrices(pattern?: string): Promise<PriceTick[]>;
  
  getOHLC(symbol: string, timeframe: string): Promise<OHLCUpdate | null>;
  getAllOHLC(pattern: string): Promise<OHLCUpdate[]>;
  
  getMarketBook(symbol: string): Promise<MarketBookUpdate | null>;
  getAllMarketBooks(pattern?: string): Promise<MarketBookUpdate[]>;
}
