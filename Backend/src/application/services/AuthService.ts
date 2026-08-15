import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { DeviceRepository } from "@domain/repositories/DeviceRepository.js";
import { DeviceSessionRepository } from "@domain/repositories/DeviceSessionRepository.js";
import { User } from "@domain/entities/User.js";
import { Session } from "@domain/entities/Session.js";
import { Device } from "@domain/entities/Device.js";
import { DeviceFingerprint, SessionToken } from "@domain/value-objects/index.js";


@injectable()
export class AuthService {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository,
    @inject("DeviceRepository") private deviceRepo: DeviceRepository,
    @inject("DeviceSessionRepository") private deviceSessionRepo: DeviceSessionRepository
  ) {}

  async establishAuthenticatedSession(user: User, request: { ip: string; headers: { "user-agent": string } }, enforceDevice: boolean): Promise<{
    ok: boolean;
    status?: number;
    error?: string;
    hasActiveSession?: boolean;
    user?: User;
    sessionToken?: string;
  }> {
    const sessionToken = (await SessionToken.generate()).value;
    let fingerprint: DeviceFingerprint | undefined;

    if (enforceDevice) {
      fingerprint = DeviceFingerprint.create(request);
      const result = await this.deviceSessionRepo.setSessionForDeviceAtomic(user.id, fingerprint.value, sessionToken);
      if (!result.success) {
        return { ok: false, status: 403, error: "Device already has active session", hasActiveSession: true };
      }
    }

    await this.sessionRepo.save(Session.create({
      userId: user.id,
      token: sessionToken,
      deviceFingerprint: fingerprint ? fingerprint.value : null,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    }));

    if (fingerprint) {
      await this.deviceRepo.bind(Device.create({ userId: user.id, fingerprint: fingerprint.value }));
    }

    return { ok: true, user, sessionToken };
  }
}