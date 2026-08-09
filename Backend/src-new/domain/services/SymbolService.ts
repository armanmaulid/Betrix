import { container } from "tsyringe";
import { SymbolRepository } from "@domain/repositories/SymbolRepository.js";
import { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";
import { Mt5Client } from "@data/external/Mt5Client.js";
import { logger } from "@core/logging/logger.js";

export async function syncBrokerSymbols(): Promise<void> {
  const symbolRepo = container.resolve(SymbolRepository);
  const mt5Client = container.resolve(Mt5Client);
  
  const symbols = await mt5Client.fetchSymbols();
  
  if (symbols.length > 0) {
    await symbolRepo.saveMany(symbols);
    logger.info(`Synced ${symbols.length} broker symbols`, { context: "Symbols" });
  }
}

export async function getActiveSymbols(): Promise<BrokerSymbol[]> {
  const symbolRepo = container.resolve(SymbolRepository);
  return symbolRepo.findActive();
}