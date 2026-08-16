import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SymbolService } from "./SymbolService.js";
import type { SymbolRepository } from "@domain/repositories/SymbolRepository.js";
import type { IBrokerProvider } from "@domain/ports/IBrokerProvider.js";
import { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";

// Mock logger: SymbolService meng-import logger yang memuat env schema (zod),
// yang butuh DATABASE_URL dll — tidak tersedia di test.
vi.mock("@core/logging/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeSymbols(n = 3): BrokerSymbol[] {
  return Array.from({ length: n }, (_, i) => new BrokerSymbol(
    `SYM${i}`,
    `Description ${i}`,
    `/path/${i}`,
    "forex",
    true,
    new Date(),
    new Date()
  ));
}

describe("SymbolService.syncBrokerSymbols (throttle Opsi B)", () => {
  const repo = {
    saveMany: vi.fn().mockResolvedValue(3),
    setStoredCount: vi.fn().mockResolvedValue(undefined),
    getLastSyncedAt: vi.fn(),
    setLastSyncedAt: vi.fn().mockResolvedValue(undefined),
    getStoredCount: vi.fn().mockResolvedValue(0),
    save: vi.fn(),
    findAll: vi.fn(),
    findActive: vi.fn(),
    findById: vi.fn(),
    findByCategory: vi.fn(),
  } as unknown as SymbolRepository;

  const broker = { fetchSymbols: vi.fn() } as unknown as IBrokerProvider;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips fetch when last sync is still fresh (< 12h)", async () => {
    repo.getLastSyncedAt = vi.fn().mockResolvedValue(new Date(Date.now() - 60 * 60 * 1000)); // 1 jam lalu
    broker.fetchSymbols = vi.fn().mockResolvedValue(makeSymbols());

    const service = new SymbolService(repo, broker);
    await service.syncBrokerSymbols();

    expect(broker.fetchSymbols).not.toHaveBeenCalled();
    expect(repo.saveMany).not.toHaveBeenCalled();
  });

  it("force bypasses the throttle even when fresh", async () => {
    repo.getLastSyncedAt = vi.fn().mockResolvedValue(new Date(Date.now() - 60 * 60 * 1000));
    broker.fetchSymbols = vi.fn().mockResolvedValue(makeSymbols());

    const service = new SymbolService(repo, broker);
    await service.syncBrokerSymbols({ force: true });

    expect(broker.fetchSymbols).toHaveBeenCalledTimes(1);
    expect(repo.saveMany).toHaveBeenCalledTimes(1);
    expect(repo.setLastSyncedAt).toHaveBeenCalled();
  });

  it("syncs when there is no last sync timestamp", async () => {
    repo.getLastSyncedAt = vi.fn().mockResolvedValue(null);
    broker.fetchSymbols = vi.fn().mockResolvedValue(makeSymbols());

    const service = new SymbolService(repo, broker);
    await service.syncBrokerSymbols();

    expect(broker.fetchSymbols).toHaveBeenCalledTimes(1);
    expect(repo.saveMany).toHaveBeenCalledTimes(1);
    expect(repo.setStoredCount).toHaveBeenCalledWith(3);
    expect(repo.setLastSyncedAt).toHaveBeenCalled();
  });

  it("syncs when the last sync is stale (>= 12h)", async () => {
    repo.getLastSyncedAt = vi.fn().mockResolvedValue(new Date(Date.now() - 13 * 60 * 60 * 1000));
    broker.fetchSymbols = vi.fn().mockResolvedValue(makeSymbols());

    const service = new SymbolService(repo, broker);
    await service.syncBrokerSymbols();

    expect(broker.fetchSymbols).toHaveBeenCalledTimes(1);
    expect(repo.saveMany).toHaveBeenCalledTimes(1);
  });

  it("does not write anything when broker returns an empty list", async () => {
    repo.getLastSyncedAt = vi.fn().mockResolvedValue(null);
    broker.fetchSymbols = vi.fn().mockResolvedValue([]);

    const service = new SymbolService(repo, broker);
    await service.syncBrokerSymbols();

    expect(repo.saveMany).not.toHaveBeenCalled();
    expect(repo.setLastSyncedAt).not.toHaveBeenCalled();
  });
});
