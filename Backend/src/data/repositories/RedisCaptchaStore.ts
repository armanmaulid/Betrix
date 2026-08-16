import { injectable } from "tsyringe";
import { redisClient } from "../orm/redisClient.js";
import { CaptchaStore } from "@domain/repositories/CaptchaStore.js";

@injectable()
export class RedisCaptchaStore implements CaptchaStore {
  async save(challengeId: string, answerHash: string, ttlSeconds: number): Promise<void> {
    await redisClient.setex(`captcha:${challengeId}`, ttlSeconds, answerHash);
  }

  async getAndDelete(challengeId: string): Promise<string | null> {
    const answerHash = await redisClient.get<string>(`captcha:${challengeId}`);
    if (answerHash) {
      await redisClient.del(`captcha:${challengeId}`);
    }
    return answerHash ?? null;
  }
}
