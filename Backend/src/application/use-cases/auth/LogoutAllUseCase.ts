import { inject, injectable } from "tsyringe";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { EventDispatcher } from "@domain/events/index.js";

interface LogoutAllRequest {
  userId: string;
  ip: string;
  userAgent?: string;
}

@injectable()
export class LogoutAllUseCase {
  constructor(
    @inject("SessionRepository") private sessionRepo: SessionRepository,
    @inject("EventDispatcher") private eventDispatcher: EventDispatcher
  ) {}

  async execute(req: LogoutAllRequest): Promise<number> {
    const sessions = await this.sessionRepo.findByUserId(req.userId);
    let count = 0;
    
    for (const session of sessions) {
      await this.sessionRepo.delete(session.token);
      count++;
    }

    // Note: We don't necessarily clear device_session mapping here, 
    // it will be overwritten/cleaned up on next login. Or we could clear it if we had a method to clear all for a user.

    this.eventDispatcher.dispatch({
      type: "USER_LOGGED_OUT_ALL",
      payload: {
        userId: req.userId,
        revokedCount: count,
        ip: req.ip,
        userAgent: req.userAgent,
      },
      timestamp: new Date()
    });

    return count;
  }
}
