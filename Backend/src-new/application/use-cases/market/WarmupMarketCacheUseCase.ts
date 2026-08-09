import { inject, injectable } from "tsyringe";
import { SymbolRepository } from "@domain/repositories/SymbolRepository.js";
import { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";
import { logger } from "@core/logging/logger.js";

const MAIN_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "EURGBP", "EURJPY", "GBPJPY", "XAUUSD", "USOIL"];

@injectable()
export class WarmupMarketCacheUseCase {
  constructor(
    @inject("SymbolRepository") private symbolRepo: SymbolRepository
  ) {}

  async execute(): Promise<void> {
    const symbols = await this.symbolRepo.findActive();
    const mainSymbols = symbols.filter(s => MAIN_SYMBOLS.includes(s.symbol));
    
    logger.info(`Warming up market cache for ${mainSymbols.length} symbols`, { context: "MarketCache" });
    
    // In a real implementation, this would fetch historical data from MT5
    // and cache it in Redis for D1 candles
    // For now, this is a placeholder
    
    logger.info("Market cache warmup completed", { context: "MarketCache" });
  }
}