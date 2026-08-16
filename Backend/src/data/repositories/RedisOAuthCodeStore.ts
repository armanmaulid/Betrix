import { injectable } from "tsyringe";
import { redisClient } from "../orm/redisClient.js";
import { OAuthCodeStore, OAuthCodePayload } from "@domain/repositories/OAuthCodeStore.js";

@injectable()
export class RedisOAuthCodeStore implements OAuthCodeStore {
  async save(code: string, payload: OAuthCodePayload, ttlSeconds: number): Promise<void> {
    await redisClient.setex(`oauth_code:${code}`, ttlSeconds, JSON.stringify(payload));
  }

  async getAndDelete(code: string): Promise<OAuthCodePayload | null> {
    const raw = await redisClient.get<string>(`oauth_code:${code}`);
    if (!raw) return null;
    await redisClient.del(`oauth_code:${code}`);
    try {
      return JSON.parse(raw) as OAuthCodePayload;
    } catch {
      return null;
    }
  }
}
