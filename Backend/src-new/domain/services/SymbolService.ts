import { inject, injectable } from "tsyringe";
import { SymbolRepository } from "@domain/repositories/SymbolRepository.js";
import { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";
import { Mt5Client } from "@data/external/Mt5Client.js";
import { logger } from "@core/logging/logger.js";

@injectable()
export class SymbolService {
  constructor(
    @inject("SymbolRepository") private symbolRepo: SymbolRepository,
    @inject("Mt5Client") private mt5Client: Mt5Client
  ) {}

  async syncBrokerSymbols(): Promise<void> {
    // Check symbol count first (incremental sync pattern)
    const count = await this.mt5Client.fetchSymbolCount();
    const storedCount = await this.symbolRepo.getStoredCount();
    
    if (count === storedCount) {
      logger.info("Symbol count unchanged, skipping full sync", { context: "Symbols" });
      return;
    }

    const symbols = await this.mt5Client.fetchSymbols();

    if (symbols.length > 0) {
      await this.symbolRepo.saveMany(symbols);
      await this.symbolRepo.setStoredCount(count);
      logger.info(`Synced ${symbols.length} broker symbols`, { context: "Symbols" });
    }
  }

  async getActiveSymbols(): Promise<any[]> {
    return this.symbolRepo.findActive();
  }
}