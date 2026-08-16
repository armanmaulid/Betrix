import { inject, injectable } from "tsyringe";
import { VerificationRepository } from "@domain/repositories/VerificationRepository.js";
import { NewsContextPort } from "@contexts/news/domain/NewsContextPort.js";
import { UsageRepository } from "@domain/repositories/UsageRepository.js";
import { LoginAttemptRepository } from "@domain/repositories/LoginAttemptRepository.js";
import { ChatRepository } from "@domain/repositories/ChatRepository.js";
import { ActivityLogRepository } from "@domain/repositories/ActivityLogRepository.js";
import { logger } from "@core/logging/logger.js";

@injectable()
export class SystemCleanupUseCase {
  constructor(
    @inject("VerificationRepository") private verificationRepo: VerificationRepository,
    @inject("NewsContextPort") private newsPort: NewsContextPort,
    @inject("CachePort") private cachePort: { cleanup: () => number },
    @inject("UsageRepository") private usageRepo: UsageRepository,
    @inject("LoginAttemptRepository") private loginAttemptRepo: LoginAttemptRepository,
    @inject("ChatRepository") private chatRepo: ChatRepository,
    @inject("ActivityLogRepository") private activityLogRepo: ActivityLogRepository
  ) {}

  async execute(): Promise<void> {
    // Retention: token_usage 90, failed_login_attempts 30, chat_logs 90,
    // user_activity_logs 90. calendar_events & admin_actions sengaja TIDAK
    // di-delete (data backtest & audit trail compliance).
    const results = await Promise.allSettled([
      Promise.resolve(0), // Redis handles session TTL automatically
      this.verificationRepo.cleanupExpired(),
      this.newsPort.cleanupOlderThan(7),
      Promise.resolve(this.cachePort.cleanup()),
      this.usageRepo.cleanupOlderThan(90),
      this.loginAttemptRepo.cleanupOlderThan(30),
      this.chatRepo.cleanupOlderThan(90),
      this.activityLogRepo.cleanupOlderThan(90),
    ]);

    const labels = ["sessions", "verify tokens", "old news", "cache", "token_usage", "failed login attempts", "chat logs", "user activity logs"];
    const cleanupSummary = results.map((r, i) =>
      r.status === "fulfilled" ? `${labels[i]}=${r.value}` : `${labels[i]}=err`
    ).join(", ");

    logger.info(`System cleanup completed: ${cleanupSummary}`, { context: "Cleanup" });
  }
}
