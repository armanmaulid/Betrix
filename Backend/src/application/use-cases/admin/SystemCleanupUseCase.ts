import { inject, injectable } from "tsyringe";
import { VerificationRepository } from "@domain/repositories/VerificationRepository.js";
import { NewsContextPort } from "@contexts/news/domain/NewsContextPort.js";
import { logger } from "@core/logging/logger.js";

@injectable()
export class SystemCleanupUseCase {
  constructor(
    @inject("VerificationRepository") private verificationRepo: VerificationRepository,
    @inject("NewsContextPort") private newsPort: NewsContextPort,
    @inject("CachePort") private cachePort: { cleanup: () => number }
  ) {}

  async execute(): Promise<void> {
    const results = await Promise.allSettled([
      Promise.resolve(0), // Redis handles session TTL automatically
      this.verificationRepo.cleanupExpired(),
      this.newsPort.cleanupOlderThan(7),
      Promise.resolve(this.cachePort.cleanup()),
    ]);

    const labels = ["sessions", "verify tokens", "old news", "cache"];
    const cleanupSummary = results.map((r, i) =>
      r.status === "fulfilled" ? `${labels[i]}=${r.value}` : `${labels[i]}=err`
    ).join(", ");

    logger.info(`System cleanup completed: ${cleanupSummary}`, { context: "Cleanup" });
  }
}
