import { injectable } from "tsyringe";
import { redisClient } from "../orm/redisClient.js";
import { DeviceSessionRepository } from "@domain/repositories/DeviceSessionRepository.js";

@injectable()
export class RedisDeviceSessionRepository implements DeviceSessionRepository {
  async getSessionByDevice(userId: string, fingerprint: string): Promise<string | null> {
    return redisClient.get(`device_session:${userId}:${fingerprint}`);
  }

  async setSessionForDevice(userId: string, fingerprint: string, sessionToken: string): Promise<void> {
    await redisClient.setex(`device_session:${userId}:${fingerprint}`, 24 * 60 * 60, sessionToken);
  }

  async removeSessionForDevice(userId: string, fingerprint: string): Promise<void> {
    await redisClient.del(`device_session:${userId}:${fingerprint}`);
  }
}