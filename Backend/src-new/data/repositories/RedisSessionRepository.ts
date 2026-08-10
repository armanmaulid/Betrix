import { injectable } from "tsyringe";
import { redisClient } from "../orm/redisClient.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { Session } from "@domain/entities/Session.js";
import { logger } from "@core/logging/logger.js";
import { hashToken } from "@core/utils/crypto.js";

const SESSION_LOOKUP_TIMEOUT_MS = 5000;
const SESSION_MEMORY_CACHE_TTL_MS = 5000;
const sessionMemoryCache = new Map<string, { session: Session; timestamp: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of sessionMemoryCache) {
    if (now - entry.timestamp >= SESSION_MEMORY_CACHE_TTL_MS) {
      sessionMemoryCache.delete(token);
    }
  }
}, 60 * 1000).unref();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    ),
  ]);
}

function hashSessionToken(token: string): string {
  return hashToken(token);
}

@injectable()
export class RedisSessionRepository implements SessionRepository {
  async findByToken(token: string): Promise<Session | null> {
    const hashedToken = hashSessionToken(token);
    const cached = sessionMemoryCache.get(hashedToken);
    if (cached && Date.now() - cached.timestamp < SESSION_MEMORY_CACHE_TTL_MS) {
      return cached.session;
    }

    const userId = await withTimeout(
      redisClient.get(`session:${hashedToken}`),
      SESSION_LOOKUP_TIMEOUT_MS,
      "Redis session lookup"
    );

    if (!userId) return null;

    // Fetch real TTL from Redis
    const ttl = await redisClient.ttl(`session:${hashedToken}`);
    const expiresAt = ttl > 0 ? new Date(Date.now() + ttl * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);

    const session = new Session(
      token,
      userId as string,
      token,
      new Date(),
      expiresAt,
      null, null, null
    );

    sessionMemoryCache.set(hashedToken, { session, timestamp: Date.now() });
    return session;
  }

  async findByUserId(userId: string): Promise<Session[]> {
    const tokens = await redisClient.smembers(`user_sessions:${userId}`);
    const sessions: Session[] = [];
    for (const token of tokens) {
      const session = await this.findByToken(token);
      if (session) sessions.push(session);
    }
    return sessions;
  }

  async save(session: Session): Promise<Session> {
    const hashedToken = hashSessionToken(session.token);
    await redisClient.setex(`session:${hashedToken}`, 24 * 60 * 60, session.userId);
    await redisClient.sadd(`user_sessions:${session.userId}`, hashedToken);
    await redisClient.expire(`user_sessions:${session.userId}`, 24 * 60 * 60);
    sessionMemoryCache.set(hashedToken, { session, timestamp: Date.now() });
    return session;
  }

  async delete(token: string): Promise<string | null> {
    const hashedToken = hashSessionToken(token);
    const userId = await redisClient.get(`session:${hashedToken}`);
    if (userId) {
      await redisClient.srem(`user_sessions:${userId}`, hashedToken);
    }
    await redisClient.del(`session:${hashedToken}`);
    sessionMemoryCache.delete(hashedToken);
    return userId as string | null;
  }

  async deleteByUserId(userId: string, exceptToken?: string): Promise<number> {
    const tokens = await redisClient.smembers(`user_sessions:${userId}`);
    const hashedTokens = tokens.map(hashSessionToken);
    const hashedExceptToken = exceptToken ? hashSessionToken(exceptToken) : undefined;
    const tokensToDelete = hashedExceptToken ? hashedTokens.filter(t => t !== hashedExceptToken) : hashedTokens;

    if (tokensToDelete.length > 0) {
      const keysToDelete = tokensToDelete.map(token => `session:${token}`);
      await redisClient.del(...keysToDelete);
      await redisClient.srem(`user_sessions:${userId}`, ...tokensToDelete);
      for (const token of tokensToDelete) {
        sessionMemoryCache.delete(token);
      }
    }

    return tokensToDelete.length;
  }

  async deleteExpired(): Promise<number> {
    // Redis handles TTL-based expiration automatically
    // This method is kept for interface compatibility but does nothing
    // since Redis handles TTL-based expiration automatically
    return 0;
  }
}