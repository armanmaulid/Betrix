import { Redis } from "@upstash/redis";
import { env } from "@config/env";

export const redisClient = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export async function closeRedisClient(): Promise<void> {
  // Upstash Redis REST client doesn't need explicit close
}