import { inject, injectable } from "tsyringe";
import { SymbolRepository } from "@domain/repositories/SymbolRepository.js";
import { IBrokerProvider } from "@domain/ports/IBrokerProvider.js";
import type { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";
import { logger } from "@core/logging/logger.js";

/**
 * Throttle window (Opsi B): boot-time sync di-skip kalau data masih fresh.
 * Full sync harian (DailySyncJob, `force: true`) tetap jalan setiap hari —
 * jadi perubahan yang tidak mengubah total count tetap ter-refresh.
 */
const SYNC_THROTTLE_MS = 12 * 60 * 60 * 1000; // 12 jam

@injectable()
export class SymbolService {
  constructor(
    @inject("SymbolRepository") private symbolRepo: SymbolRepository,
    @inject("IBrokerProvider") private brokerClient: IBrokerProvider
  ) {}

  async syncBrokerSymbols(options: { force?: boolean } = {}): Promise<void> {
    // Throttle berbasis waktu: kalau sync terakhir masih dalam window,
    // skip fetch symbol/list (hemat panggilan MT5 saat restart beruntun).
    const lastSyncedAt = await this.symbolRepo.getLastSyncedAt();
    if (!options.force && lastSyncedAt) {
      const elapsedMs = Date.now() - lastSyncedAt.getTime();
      if (elapsedMs < SYNC_THROTTLE_MS) {
        logger.info(
          `Skipping symbol sync — last synced ${Math.round(elapsedMs / 60000)} min ago (throttle ${SYNC_THROTTLE_MS / (60 * 60 * 1000)}h)`,
          { context: "Symbols" }
        );
        return;
      }
    }

    // Jangan skip berdasarkan kesamaan total count — tambah-1 + hapus-1 (net count
    // sama) atau perubahan description/category/trade_mode (isActive) tanpa ubah
    // total tidak akan pernah terdeteksi, dan broker_symbols jadi stale selamanya.
    // saveMany sudah idempotent (ON CONFLICT DO UPDATE), jadi selalu jalan aman.
    const symbols = await this.brokerClient.fetchSymbols();

    if (symbols.length > 0) {
      await this.symbolRepo.saveMany(symbols);
      await this.symbolRepo.setStoredCount(symbols.length);
      await this.symbolRepo.setLastSyncedAt(new Date());
      logger.info(`Synced ${symbols.length} broker symbols`, { context: "Symbols" });
    }
  }

  async getActiveSymbols(): Promise<BrokerSymbol[]> {
    return this.symbolRepo.findActive();
  }
}