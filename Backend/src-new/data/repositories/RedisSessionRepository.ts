import { injectable } from "tsyringe";
import { redisClient } from "../orm/redisClient.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { Session } from "@domain/entities/Session.js";
import { logger } from "@core/logging/logger.js";

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

@injectable()
export class RedisSessionRepository implements SessionRepository {
  async findByToken(token: string): Promise<Session | null> {
    const cached = sessionMemoryCache.get(token);
    if (cached && Date.now() - cached.timestamp < SESSION_MEMORY_CACHE_TTL_MS) {
      return cached.session;
    }

    const userId = await withTimeout(
      redisClient.get(`session:${token}`),
      SESSION_LOOKUP_TIMEOUT_MS,
      "Redis session lookup"
    );

    if (!userId) return null;

    const session = new Session(
      token,
      userId as string,
      token,
      new Date(),
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      null, null, null
    );

    sessionMemoryCache.set(token, { session, timestamp: Date.now() });
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
    await redisClient.setex(`session:${session.token}`, 24 * 60 * 60, session.userId);
    await redisClient.sadd(`user_sessions:${session.userId}`, session.token);
    await redisClient.expire(`user_sessions:${session.userId}`, 24 * 60 * 60);
    sessionMemoryCache.set(session.token, { session, timestamp: Date.now() });
    return session;
  }

  async delete(token: string): Promise<void> {
    const userId = await redisClient.get(`session:${token}`);
    if (userId) {
      await redisClient.srem(`user_sessions:${userId}`, token);
    }
    await redisClient.del(`session:${token}`);
    sessionMemoryCache.delete(token);
  }

  async deleteByUserId(userId: string, exceptToken?: string): Promise<number> {
    const tokens = await redisClient.smembers(`user_sessions:${userId}`);
    const tokensToDelete = exceptToken ? tokens.filter(t => t !== exceptToken) : tokens;

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
    return 0;
  }
}