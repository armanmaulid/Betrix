import { injectable } from "tsyringe";
import { redisClient } from "../orm/redisClient.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { Session } from "@domain/entities/Session.js";
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

    const stored = await withTimeout(
      redisClient.get<string | Record<string, unknown>>(`session:${hashedToken}`),
      SESSION_LOOKUP_TIMEOUT_MS,
      "Redis session lookup"
    );

    if (!stored) return null;

    const ttl = await redisClient.ttl(`session:${hashedToken}`);
    const expiresAt = ttl > 0 ? new Date(Date.now() + ttl * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);

    const session = this.reconstructSession(stored, token, expiresAt);

    sessionMemoryCache.set(hashedToken, { session, timestamp: Date.now() });
    return session;
  }

  async findByUserId(userId: string): Promise<Session[]> {
    const hashedTokens = await redisClient.smembers(`user_sessions:${userId}`); // already hashed
    const sessions: Session[] = [];

    for (const hashedToken of hashedTokens) {
      const cached = sessionMemoryCache.get(hashedToken);
      if (cached && Date.now() - cached.timestamp < SESSION_MEMORY_CACHE_TTL_MS) {
        sessions.push(cached.session);
        continue;
      }

      const stored = await redisClient.get<string | Record<string, unknown>>(`session:${hashedToken}`);
      if (!stored) continue;

      const ttl = await redisClient.ttl(`session:${hashedToken}`);
      const expiresAt = ttl > 0 ? new Date(Date.now() + ttl * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Note: raw token is not recoverable from the hash — this session object's
      // `token` field will be the hashed value, not the original (pre-existing
      // one-way-hash constraint).
      sessions.push(this.reconstructSession(stored, hashedToken, expiresAt));
    }

    return sessions;
  }

  async save(session: Session): Promise<Session> {
    const hashedToken = hashSessionToken(session.token);
    // Simpan metadata session lengkap (userId, ip, userAgent, deviceFingerprint)
    // agar bisa ditampilkan di /auth/sessions. Format lama (plain userId) tetap
    // dibaca lewat fallback di reconstructSession.
    const payload = JSON.stringify({
      v: 2,
      userId: session.userId,
      ip: session.ip,
      userAgent: session.userAgent,
      deviceFingerprint: session.deviceFingerprint,
    });
    await redisClient.setex(`session:${hashedToken}`, 24 * 60 * 60, payload);
    await redisClient.sadd(`user_sessions:${session.userId}`, hashedToken);
    await redisClient.expire(`user_sessions:${session.userId}`, 24 * 60 * 60);
    sessionMemoryCache.set(hashedToken, { session, timestamp: Date.now() });
    return session;
  }

  async delete(token: string): Promise<string | null> {
    const hashedToken = hashSessionToken(token);
    const stored = await redisClient.get<string | Record<string, unknown>>(`session:${hashedToken}`);
    // Nilai Redis kini JSON v2 (object setelah auto-parse) atau plain userId
    // (format lama) — ekstrak userId saja, jangan kembalikan seluruh nilai.
    const userId = this.extractUserId(stored);
    if (userId) {
      await redisClient.srem(`user_sessions:${userId}`, hashedToken);
    }
    await redisClient.del(`session:${hashedToken}`);
    sessionMemoryCache.delete(hashedToken);
    return userId;
  }

  async deleteByUserId(userId: string, exceptToken?: string): Promise<number> {
    const hashedTokens = await redisClient.smembers(`user_sessions:${userId}`); // already hashed
    const hashedExceptToken = exceptToken ? hashSessionToken(exceptToken) : undefined;
    const tokensToDelete = hashedExceptToken
      ? hashedTokens.filter(t => t !== hashedExceptToken)
      : hashedTokens;

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

  private extractUserId(stored: string | Record<string, unknown> | null): string | null {
    if (!stored) return null;
    if (typeof stored === "object" && stored !== null) {
      return (stored.userId as string) || null;
    }
    if (typeof stored === "string" && stored.startsWith("{")) {
      try {
        const parsed = JSON.parse(stored) as { userId?: string };
        return parsed.userId || null;
      } catch {
        return stored; // format lama: plain userId
      }
    }
    return stored;
  }

  /**
   * Rekonstruksi Session dari nilai Redis. Client Upstash meng-parse JSON
   * secara otomatis, jadi nilai bisa berupa string (plain userId format lama
   * ATAU JSON string) atau object (JSON ter-parse). Format baru (v2): object
   * `{ userId, ip, userAgent, deviceFingerprint }`. Format lama: plain
   * userId (string) — tetap didukung supaya session yang dibuat sebelum
   * perubahan ini tidak invalid.
   */
  private reconstructSession(stored: string | Record<string, unknown>, token: string, expiresAt: Date): Session {
    let userId = typeof stored === "string" ? stored : "";
    let ip: string | null = null;
    let userAgent: string | null = null;
    let deviceFingerprint: string | null = null;

    if (typeof stored === "object" && stored !== null) {
      userId = (stored.userId as string) || "";
      ip = (stored.ip as string | null) ?? null;
      userAgent = (stored.userAgent as string | null) ?? null;
      deviceFingerprint = (stored.deviceFingerprint as string | null) ?? null;
    } else if (typeof stored === "string") {
      const extracted = this.extractUserId(stored);
      if (extracted) userId = extracted;
    }

    return new Session(
      token,
      userId,
      token,
      new Date(),
      expiresAt,
      deviceFingerprint,
      ip,
      userAgent
    );
  }
}