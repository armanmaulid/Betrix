import { container } from "tsyringe";
import { pgClient } from "@data/orm/pgClient.js";
import { redisClient } from "@data/orm/redisClient.js";
import { logger } from "@core/logging/logger.js";

export async function cleanupExpiredSessions(): Promise<number> {
  return 0; // Redis handles TTL automatically
}

export async function cleanupOldFailedAttempts(): Promise<number> {
  const { rowCount } = await pgClient.query(
    `DELETE FROM failed_login_attempts WHERE attempted_at < NOW() - INTERVAL '30 days'`
  );
  return rowCount || 0;
}

export async function cleanupExpiredTokens(): Promise<number> {
  const { rowCount } = await pgClient.query(
    `DELETE FROM email_verifications WHERE expires_at < NOW() OR used_at IS NOT NULL`
  );
  return rowCount || 0;
}

export async function cleanupOldUsageRecords(): Promise<number> {
  const { rowCount } = await pgClient.query(
    `DELETE FROM token_usage WHERE created_at < NOW() - INTERVAL '90 days'`
  );
  return rowCount || 0;
}

export async function cleanupOldNews(days: number): Promise<number> {
  const { rowCount } = await pgClient.query(
    `DELETE FROM news_articles WHERE published_at < NOW() - INTERVAL '1 day' * $1`,
    [days]
  );
  return rowCount || 0;
}