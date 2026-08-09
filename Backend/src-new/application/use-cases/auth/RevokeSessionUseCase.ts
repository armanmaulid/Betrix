import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { DeviceRepository } from "@domain/repositories/DeviceRepository.js";
import { DeviceSessionRepository } from "@domain/repositories/DeviceSessionRepository.js";
import { User } from "@domain/entities/User.js";
import { NotFoundError, AuthenticationError } from "@core/errors/index.js";
import { logUserActivity } from "@domain/services/ActivityLogger.js";

interface RevokeSessionInput {
  sessionToken: string;
  fingerprint: string;
  request: { ip: string; headers: { "user-agent": string } };
}

@injectable()
export class RevokeSessionUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository,
    @inject("DeviceRepository") private deviceRepo: DeviceRepository,
    @inject("DeviceSessionRepository") private deviceSessionRepo: DeviceSessionRepository
  ) {}

  async execute(input: RevokeSessionInput): Promise<void> {
    const session = await this.sessionRepo.findByToken(input.sessionToken);
    if (!session) {
      throw new AuthenticationError("Session not found or expired");
    }

    const targetToken = await this.deviceSessionRepo.getSessionByDevice(session.userId, input.fingerprint);
    if (targetToken) {
      await this.sessionRepo.delete(targetToken);
      await this.deviceSessionRepo.removeSessionForDevice(session.userId, input.fingerprint);
    }

    await this.deviceRepo.unbind(session.userId, input.fingerprint);

    await logUserActivity({
      userId: session.userId,
      action: "session_revoked",
      details: { fingerprint: input.fingerprint },
      ip: input.request.ip,
      userAgent: input.request.headers["user-agent"] ?? null,
    });
  }
}