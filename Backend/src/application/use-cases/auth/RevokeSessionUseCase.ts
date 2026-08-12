import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { DeviceRepository } from "@domain/repositories/DeviceRepository.js";
import { DeviceSessionRepository } from "@domain/repositories/DeviceSessionRepository.js";
import { User } from "@domain/entities/User.js";
import { DeviceFingerprint } from "@domain/value-objects";
import { NotFoundError, AuthenticationError } from "@core/errors/index.js";
import { ActivityLogRepository } from "@domain/repositories/ActivityLogRepository.js";
import { RequestInput } from "@core/utils/request.js";

interface RevokeSessionInput {
  sessionToken: string;
  fingerprint: string;
  request: RequestInput;
}

@injectable()
export class RevokeSessionUseCase {
  constructor(
    @inject("ActivityLogRepository") private activityLogRepo: ActivityLogRepository,
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

    const fingerprint = new DeviceFingerprint(input.fingerprint);
    const targetToken = await this.deviceSessionRepo.getSessionByDevice(session.userId, fingerprint.value);
    if (targetToken) {
      await this.sessionRepo.delete(targetToken);
      await this.deviceSessionRepo.removeSessionForDevice(session.userId, fingerprint.value);
    }

    await this.deviceRepo.unbind(session.userId, fingerprint);

    await this.activityLogRepo.logUserActivity({
      userId: session.userId,
      action: "session_revoked",
      details: { fingerprint: input.fingerprint },
      ip: input.request.ip,
      userAgent: input.request.userAgent ?? null,
    });
  }
}