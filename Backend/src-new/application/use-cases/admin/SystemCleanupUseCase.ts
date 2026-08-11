import { inject, injectable } from "tsyringe";
import { LoginAttemptRepository } from "@domain/repositories/LoginAttemptRepository.js";
import { VerificationRepository } from "@domain/repositories/VerificationRepository.js";
import { UsageRepository } from "@domain/repositories/UsageRepository.js";
import { NewsRepository } from "@domain/repositories/NewsRepository.js";
import { logger } from "@core/logging/logger.js";

@injectable()
export class SystemCleanupUseCase {
  constructor(
    @inject("VerificationRepository") private verificationRepo: VerificationRepository,
    @inject("NewsRepository") private newsRepo: NewsRepository,
    @inject("CachePort") private cachePort: { cleanup: () => number }
  ) {}

  async execute(): Promise<void> {
    const results = await Promise.allSettled([
      Promise.resolve(0), // Redis handles session TTL automatically
      this.verificationRepo.cleanupExpired(),
      this.newsRepo.cleanupOlderThan(7),
      Promise.resolve(this.cachePort.cleanup()),
    ]);

    const labels = ["sessions", "verify tokens", "old news", "cache"];
    const cleanupSummary = results.map((r, i) =>
      r.status === "fulfilled" ? `${labels[i]}=${r.value}` : `${labels[i]}=err`
    ).join(", ");

    logger.info(`System cleanup completed: ${cleanupSummary}`, { context: "Cleanup" });
  }
}
