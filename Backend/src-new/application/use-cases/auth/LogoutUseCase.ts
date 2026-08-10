import { inject, injectable } from "tsyringe";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { DeviceSessionRepository } from "@domain/repositories/DeviceSessionRepository.js";
import { getDeviceFingerprint } from "@core/utils/index.js";
import { logUserActivity } from "@domain/services/ActivityLogger.js";
import { RequestInput } from "@core/utils/request.js";

interface LogoutInput {
  sessionToken: string;
  request: RequestInput;
}

@injectable()
export class LogoutUseCase {
  constructor(
    @inject("SessionRepository") private sessionRepo: SessionRepository,
    @inject("DeviceSessionRepository") private deviceSessionRepo: DeviceSessionRepository
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    const userId = await this.sessionRepo.delete(input.sessionToken);

    if (userId) {
      const fingerprint = getDeviceFingerprint(input.request);
      await this.deviceSessionRepo.removeSessionForDevice(userId, fingerprint);
      
      await logUserActivity({
        userId,
        action: "logout",
        ip: input.request.ip,
        userAgent: input.request.userAgent ?? null,
      });
    }
  }
}