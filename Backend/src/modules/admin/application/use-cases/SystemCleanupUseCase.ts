import { inject, injectable } from "tsyringe";
import { VerificationRepository } from "@domain/repositories/VerificationRepository.js";
import { NewsContextPort } from "@modules/news/news.module.js";
import { logger } from "@core/logging/logger.js";

@injectable()
export class SystemCleanupUseCase {
  constructor(
    @inject("VerificationRepository") private verificationRepo: VerificationRepository,
    @inject("NewsContextPort") private newsPort: NewsContextPort,
    @inject("CachePort") private cachePort: { cleanup: () => number }
  ) {}

  async execute(): Promise<void> {
    // Deliberately NEVER auto-deleted here — full history is kept from
    // account creation onward:
    // - token_usage        — usage/billing history (GetUsageUseCase only
    //                        aggregates it today, but the raw rows are kept
    //                        so a full per-user history view stays possible
    //                        later, and so past usage/credit spend is never
    //                        silently unrecoverable).
    // - failed_login_attempts — kept in full too; only the last 15 min is
    //                        ever read (captcha/delay gate), so growth here
    //                        has no functional cost, just storage.
    // - chat_logs          — conversation content, read back via
    //                        GET /chat/history and GET /chat/export.
    // - user_activity_logs — the user's own activity feed, GET /me/activity.
    // - calendar_events    — kept for backtesting.
    // - admin_actions      — audit trail / compliance record.
    // Only things that are pure ephemeral/derived state (sessions via Redis
    // TTL, one-time verification tokens, cached news, general cache) are
    // ever purged here. If storage growth on any of the "kept" tables ever
    // becomes a real problem, archive (export + move to cold storage)
    // rather than adding a delete back in here.
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
