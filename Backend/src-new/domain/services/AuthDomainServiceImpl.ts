import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { DeviceRepository } from "@domain/repositories/DeviceRepository.js";
import { DeviceSessionRepository } from "@domain/repositories/DeviceSessionRepository.js";
import { User, UserStatus } from "@domain/entities/User.js";
import { Session } from "@domain/entities/Session.js";
import { Device } from "@domain/entities/Device.js";
import { DeviceFingerprint } from "@domain/value-objects/index.js";
import { AuthenticationError, ConflictError } from "@core/errors/index.js";
import { generateSecureToken } from "@core/utils/index.js";
import { isDeviceEnforcementEnabled } from "@config/deviceEnforcement.js";
import { LIMITS } from "@core/constants/index.js";

@injectable()
export class AuthDomainService {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository,
    @inject("DeviceRepository") private deviceRepo: DeviceRepository,
    @inject("DeviceSessionRepository") private deviceSessionRepo: DeviceSessionRepository
  ) {}

  async establishAuthenticatedSession(user: User, request: { ip: string; headers: { "user-agent": string } }): Promise<{
    ok: boolean;
    status?: number;
    error?: string;
    hasActiveSession?: boolean;
    user?: User;
    sessionToken?: string;
  }> {
    if (isDeviceEnforcementEnabled()) {
      const fingerprint = new DeviceFingerprint(request.headers["user-agent"]); // Simplified
      const existingSession = await this.deviceSessionRepo.getSessionByDevice(user.id, fingerprint.value);
      if (existingSession) {
        return { ok: false, status: 403, error: "Device already has active session", hasActiveSession: true };
      }
    }

    const sessionToken = generateSecureToken(LIMITS.SESSION_TOKEN_BYTES);
    await this.sessionRepo.save(Session.create({
      userId: user.id,
      token: sessionToken,
      deviceFingerprint: isDeviceEnforcementEnabled() ? request.headers["user-agent"] : null,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    }));

    if (isDeviceEnforcementEnabled()) {
      const fingerprint = new DeviceFingerprint(request.headers["user-agent"]);
      await this.deviceSessionRepo.setSessionForDevice(user.id, fingerprint.value, sessionToken);
      await this.deviceRepo.bind(Device.create({ userId: user.id, fingerprint }));
    }

    return { ok: true, user, sessionToken };
  }
}