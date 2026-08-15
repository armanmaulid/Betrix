import { inject, injectable } from "tsyringe";
import { redisClient } from "../orm/redisClient.js";
import { DeviceSessionRepository } from "@domain/repositories/DeviceSessionRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";

@injectable()
export class RedisDeviceSessionRepository implements DeviceSessionRepository {
  constructor(
    @inject("SessionRepository") private sessionRepo: SessionRepository
  ) {}

  async getSessionByDevice(userId: string, fingerprint: string): Promise<string | null> {
    const token = await redisClient.get(`device_session:${userId}:${fingerprint}`);
    return (token as string | null) ?? null;
  }

  async setSessionForDevice(userId: string, fingerprint: string, sessionToken: string): Promise<void> {
    // Atomic check-and-set using SET NX to prevent TOCTOU race condition
    const key = `device_session:${userId}:${fingerprint}`;
    const acquired = await redisClient.set(key, sessionToken, {
      nx: true, // Only set if key doesn't exist
      ex: 24 * 60 * 60, // 24 hours TTL
    });

    if (!acquired) {
      // Key already exists - get the existing session token and throw conflict
      const existingToken = await redisClient.get(key);
      if (existingToken) {
        throw new Error("DEVICE_SESSION_EXISTS");
      }
    }
  }

  async setSessionForDeviceAtomic(userId: string, fingerprint: string, sessionToken: string): Promise<{ success: boolean; oldToken?: string }> {
    const key = `device_session:${userId}:${fingerprint}`;
    const acquired = await redisClient.set(key, sessionToken, {
      nx: true, // Only set if key doesn't exist
      ex: 24 * 60 * 60, // 24 hours TTL
    });

    if (!acquired) {
      // Key already exists - get the existing session token
      const existingToken = await redisClient.get(key);
      return { success: false, oldToken: (existingToken as string) ?? undefined };
    }
    return { success: true };
  }

  async replaceSessionForDevice(userId: string, fingerprint: string, sessionToken: string): Promise<string | null> {
    // Atomic get-and-set using Lua script to ensure atomicity
    const luaScript = `
      local old = redis.call('GET', KEYS[1])
      redis.call('SETEX', KEYS[1], ARGV[2], ARGV[1])
      return old
    `;
    const script = redisClient.createScript(luaScript);
    const oldToken = await script.eval([`device_session:${userId}:${fingerprint}`], [sessionToken, String(24 * 60 * 60)]);
    return oldToken as string | null;
  }

  async removeSessionForDevice(userId: string, fingerprint: string): Promise<void> {
    await redisClient.del(`device_session:${userId}:${fingerprint}`);
  }
}