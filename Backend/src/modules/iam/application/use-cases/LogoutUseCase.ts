import { inject, injectable } from "tsyringe";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { DeviceSessionRepository } from "@domain/repositories/DeviceSessionRepository.js";
import { DeviceFingerprint } from "@domain/value-objects/index.js";
import { ActivityLogRepository } from "@domain/repositories/ActivityLogRepository.js";
import { RequestInput } from "@core/utils/request.js";

interface LogoutInput {
  sessionToken: string;
  request: RequestInput;
}

@injectable()
export class LogoutUseCase {
  constructor(
    @inject("ActivityLogRepository") private activityLogRepo: ActivityLogRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository,
    @inject("DeviceSessionRepository") private deviceSessionRepo: DeviceSessionRepository
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    const userId = await this.sessionRepo.delete(input.sessionToken);

    if (userId) {
      const fingerprint = DeviceFingerprint.create(input.request).value;
      await this.deviceSessionRepo.removeSessionForDevice(userId, fingerprint);
      
      await this.activityLogRepo.logUserActivity({
        userId,
        action: "logout",
        ip: input.request.ip,
        userAgent: input.request.userAgent ?? null,
      });
    }
  }
}