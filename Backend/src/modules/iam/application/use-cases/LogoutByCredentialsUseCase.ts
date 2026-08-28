import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { DeviceSessionRepository } from "@domain/repositories/DeviceSessionRepository.js";
import { EventDispatcher } from "@domain/events/index.js";
import { AuthenticationError } from "@core/errors/index.js";
import { verifyPassword } from "@core/utils/crypto.js";
import { DeviceFingerprint, Email } from "@domain/value-objects/index.js";
import type { AppSettings } from "@core/settings/AppSettings.js";

interface LogoutByCredentialsRequest {
  email: string;
  passwordRaw: string;
  ip: string;
  headers: { "user-agent"?: string };
}

@injectable()
export class LogoutByCredentialsUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository,
    @inject("DeviceSessionRepository") private deviceSessionRepo: DeviceSessionRepository,
    @inject("EventDispatcher") private eventDispatcher: EventDispatcher,
    @inject("AppSettings") private settings: AppSettings
  ) {}

  async execute(req: LogoutByCredentialsRequest): Promise<void> {
    const user = await this.userRepo.findByEmail(new Email(req.email)); 
    
    if (!user) {
      throw new AuthenticationError("Email atau password salah");
    }

    if (!user.passwordHash) {
      throw new AuthenticationError("Gunakan login Google untuk akun ini");
    }

    const isValid = await verifyPassword(req.passwordRaw, user.passwordHash);
    if (!isValid) {
      throw new AuthenticationError("Email atau password salah");
    }

    let fingerprintStr: string | null = null;
    if (this.settings.deviceEnforcementEnabled) {
      const fingerprint = DeviceFingerprint.create({ ip: req.ip, headers: req.headers });
      fingerprintStr = fingerprint.value;
      const sessionToken = await this.deviceSessionRepo.getSessionByDevice(user.id, fingerprintStr);
      
      if (sessionToken) {
        await this.sessionRepo.delete(sessionToken);
        await this.deviceSessionRepo.removeSessionForDevice(user.id, fingerprintStr);
      }
    } else {
      // In this new architecture, if device enforcement is disabled, we might not have a reliable way to target the *current* device session based on credentials.
      // But typically we should just revoke the session token passed in headers.
      // Wait, LogoutByCredentials doesn't pass sessionToken, it passes email+password. 
      // It relies on DeviceFingerprint to find the session.
      const fingerprint = DeviceFingerprint.create({ ip: req.ip, headers: req.headers });
      fingerprintStr = fingerprint.value;
      const sessionToken = await this.deviceSessionRepo.getSessionByDevice(user.id, fingerprintStr);
      
      if (sessionToken) {
        await this.sessionRepo.delete(sessionToken);
        await this.deviceSessionRepo.removeSessionForDevice(user.id, fingerprintStr);
      }
    }

    this.eventDispatcher.dispatch({
      type: "USER_LOGGED_OUT",
      payload: {
        userId: user.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        via: "credentials"
      },
      timestamp: new Date()
    });
  }
}
