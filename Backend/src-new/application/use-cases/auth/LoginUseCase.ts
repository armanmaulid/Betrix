import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { DeviceRepository } from "@domain/repositories/DeviceRepository.js";
import { LoginAttemptRepository } from "@domain/repositories/LoginAttemptRepository.js";
import { DeviceSessionRepository } from "@domain/repositories/DeviceSessionRepository.js";
import { User, UserStatus } from "@domain/entities/User.js";
import { Email } from "@domain/value-objects";
import { DeviceFingerprint } from "@domain/value-objects";
import { Session } from "@domain/entities/Session.js";
import { AuthenticationError, ValidationError, ConflictError, InternalError } from "@core/errors/index.js";
import { verifyPassword, hashPassword, generateSecureToken, getDeviceFingerprint } from "@core/utils/index.js";
import { isDeviceEnforcementEnabled } from "@config/deviceEnforcement.js";
import { AuthDomainService } from "@domain/services/AuthDomainServiceImpl.js";
import { logUserActivity } from "@domain/services/ActivityLogger.js";
import { LIMITS } from "@core/constants/index.js";
import { RequestInput } from "@core/utils/request.js";

interface LoginInput {
  email: string;
  password: string;
  request: RequestInput;
}

interface LoginOutput {
  user: User;
  sessionToken: string;
}

@injectable()
export class LoginUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository,
    @inject("DeviceRepository") private deviceRepo: DeviceRepository,
    @inject("LoginAttemptRepository") private loginAttemptRepo: LoginAttemptRepository,
    @inject("DeviceSessionRepository") private deviceSessionRepo: DeviceSessionRepository,
    @inject("AuthDomainService") private authDomainService: AuthDomainService
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const email = new Email(input.email);
    const clientIP = input.request.ip;

    if (await this.loginAttemptRepo.isAccountLocked(email.value, clientIP)) {
      throw new AuthenticationError("Too many failed login attempts. Try again in 15 minutes.");
    }

    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      await this.loginAttemptRepo.recordFailedLogin(email.value, clientIP);
      await verifyPassword(input.password, "$2a$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGDMVr5yUP1KUOYTa");
      throw new AuthenticationError("Invalid email or password");
    }

    if (!user.passwordHash) {
      await this.loginAttemptRepo.recordFailedLogin(email.value, clientIP);
      throw new AuthenticationError("Use Google login for this account");
    }

    const match = await verifyPassword(input.password, user.passwordHash);
    if (!match) {
      await this.loginAttemptRepo.recordFailedLogin(email.value, clientIP);
      throw new AuthenticationError("Invalid email or password");
    }

    await this.loginAttemptRepo.clearFailedLogins(email.value);

    if (!user.canLogin()) {
      throw new AuthenticationError(`Account is ${user.status === UserStatus.BANNED ? "banned" : "suspended"}. Contact admin.`);
    }

    const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION === "true";
    if (requireVerification && !user.emailVerified) {
      throw new AuthenticationError("Email not verified. Check your inbox.");
    }

    const requestForAuth = {
      ip: input.request.ip,
      headers: { "user-agent": input.request.headers["user-agent"] as string },
    };

    const result = await this.authDomainService.establishAuthenticatedSession(user, requestForAuth);
    if (!result.ok) {
      throw new AuthenticationError(result.error, { 
        ...(result.hasActiveSession ? { hasActiveSession: true } : {}) 
      });
    }

    await logUserActivity({
      userId: user.id,
      action: "login",
      details: { email: user.email },
      ip: clientIP,
      userAgent: input.request.headers["user-agent"] as string ?? undefined,
    });

    return { user: result.user!, sessionToken: result.sessionToken! };
  }
}