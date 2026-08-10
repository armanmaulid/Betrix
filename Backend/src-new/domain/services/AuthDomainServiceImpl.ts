import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { DeviceRepository } from "@domain/repositories/DeviceRepository.js";
import { DeviceSessionRepository } from "@domain/repositories/DeviceSessionRepository.js";
import { User, UserStatus } from "@domain/entities/User.js";
import { Session } from "@domain/entities/Session.js";
import { Device } from "@domain/entities/Device.js";
import { DeviceFingerprint } from "@domain/value-objects/index.js";
import { AuthenticationError, ConflictError, InternalError } from "@core/errors/index.js";
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
      // Atomic check-and-set to prevent TOCTOU race condition
      const fingerprint = DeviceFingerprint.create(request);
      const result = await this.deviceSessionRepo.setSessionForDeviceAtomic(user.id, fingerprint.value, ""); // placeholder token

      if (!result.success) {
        return { ok: false, status: 403, error: "Device already has active session", hasActiveSession: true };
      }
    }

    const sessionToken = generateSecureToken(LIMITS.SESSION_TOKEN_BYTES);
    await this.sessionRepo.save(Session.create({
      userId: user.id,
      token: sessionToken,
      deviceFingerprint: isDeviceEnforcementEnabled() ? DeviceFingerprint.create(request).value : null,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    }));

    if (isDeviceEnforcementEnabled()) {
      const fingerprint = DeviceFingerprint.create(request);
      // Atomic replace - returns old token if existed
      const oldToken = await this.deviceSessionRepo.replaceSessionForDevice(user.id, fingerprint.value, sessionToken);
      
      // If there was an old session, revoke it
      if (oldToken) {
        await this.sessionRepo.delete(oldToken);
      }
      
      await this.deviceRepo.bind(Device.create({ userId: user.id, fingerprint: fingerprint.value }));
    }

    return { ok: true, user, sessionToken };
  }
}