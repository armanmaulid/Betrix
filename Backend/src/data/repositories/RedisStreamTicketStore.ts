import { injectable } from "tsyringe";
import { redisClient } from "../orm/redisClient.js";
import { StreamTicketStore } from "@domain/repositories/StreamTicketStore.js";

@injectable()
export class RedisStreamTicketStore implements StreamTicketStore {
  async save(ticket: string, sessionToken: string, ttlSeconds: number): Promise<void> {
    await redisClient.setex(`stream_ticket:${ticket}`, ttlSeconds, sessionToken);
  }

  async getAndDelete(ticket: string): Promise<string | null> {
    const sessionToken = await redisClient.get<string>(`stream_ticket:${ticket}`);
    if (sessionToken) {
      await redisClient.del(`stream_ticket:${ticket}`);
    }
    return sessionToken ?? null;
  }
}
