import type { Session } from "../entities/Session.js";

export interface SessionRepository {
  findByToken(token: string): Promise<Session | null>;
  findByUserId(userId: string): Promise<Session[]>;
  save(session: Session): Promise<Session>;
  delete(token: string): Promise<string | null>;
  deleteByUserId(userId: string, exceptToken?: string): Promise<number>;
  deleteExpired(): Promise<number>;
}