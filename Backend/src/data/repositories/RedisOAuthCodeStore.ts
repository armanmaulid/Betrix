import { injectable } from "tsyringe";
import { redisClient } from "../orm/redisClient.js";
import { OAuthCodeStore, OAuthCodePayload } from "@domain/repositories/OAuthCodeStore.js";

@injectable()
export class RedisOAuthCodeStore implements OAuthCodeStore {
  async save(code: string, payload: OAuthCodePayload, ttlSeconds: number): Promise<void> {
    await redisClient.setex(`oauth_code:${code}`, ttlSeconds, JSON.stringify(payload));
  }

  async getAndDelete(code: string): Promise<OAuthCodePayload | null> {
    const raw = await redisClient.get<string | Record<string, unknown>>(`oauth_code:${code}`);
    if (!raw) return null;
    await redisClient.del(`oauth_code:${code}`);
    // Upstash REST client auto-parses JSON on read (automaticDeserialization
    // defaults to true), jadi `raw` bisa sudah berupa object — parse hanya
    // kalau masih string (pola sama dengan RedisSessionRepository /
    // RedisMarketDataRepository). Tanpa guard ini, JSON.parse(object) throw
    // dan tiap code dianggap invalid (400 "Invalid or expired OAuth code").
    try {
      return typeof raw === "string"
        ? (JSON.parse(raw) as OAuthCodePayload)
        : (raw as unknown as OAuthCodePayload);
    } catch {
      return null;
    }
  }
}
