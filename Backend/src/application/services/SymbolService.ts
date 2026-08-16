import { inject, injectable } from "tsyringe";
import { SymbolRepository } from "@domain/repositories/SymbolRepository.js";
import { IBrokerProvider } from "@domain/ports/IBrokerProvider.js";
import type { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";
import { logger } from "@core/logging/logger.js";

@injectable()
export class SymbolService {
  constructor(
    @inject("SymbolRepository") private symbolRepo: SymbolRepository,
    @inject("IBrokerProvider") private brokerClient: IBrokerProvider
  ) {}

  async syncBrokerSymbols(): Promise<void> {
    // Jangan skip berdasarkan kesamaan total count — tambah-1 + hapus-1 (net count
    // sama) atau perubahan description/category/trade_mode (isActive) tanpa ubah
    // total tidak akan pernah terdeteksi, dan broker_symbols jadi stale selamanya.
    // saveMany sudah idempotent (ON CONFLICT DO UPDATE), jadi selalu jalan aman.
    const symbols = await this.brokerClient.fetchSymbols();

    if (symbols.length > 0) {
      await this.symbolRepo.saveMany(symbols);
      await this.symbolRepo.setStoredCount(symbols.length);
      logger.info(`Synced ${symbols.length} broker symbols`, { context: "Symbols" });
    }
  }

  async getActiveSymbols(): Promise<BrokerSymbol[]> {
    return this.symbolRepo.findActive();
  }
}