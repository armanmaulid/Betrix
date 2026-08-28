import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { DeviceRepository } from "@domain/repositories/DeviceRepository.js";
import { LoginAttemptRepository } from "@domain/repositories/LoginAttemptRepository.js";
import { DeviceSessionRepository } from "@domain/repositories/DeviceSessionRepository.js";
import { User, UserStatus } from "@domain/entities/User.js";
import { Email } from "@domain/value-objects";
import { AuthenticationError, AuthorizationError, CaptchaRequiredError } from "@core/errors/index.js";
import { verifyPassword } from "@core/utils/index.js";
import type { AppSettings } from "@core/settings/AppSettings.js";
import { AuthService } from "@modules/iam/application/services/AuthService.js";
import { CaptchaService } from "@modules/iam/application/services/CaptchaService.js";
import { ActivityLogRepository } from "@domain/repositories/ActivityLogRepository.js";
import { RequestInput } from "@core/utils/request.js";
import { LOGIN_FAILURE_WINDOW_MINUTES, computeLoginDelaySeconds, isCaptchaRequired } from "@domain/services/loginPolicy.js";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface LoginInput {
  email: string;
  password: string;
  request: RequestInput;
  captcha?: { challengeId: string; answer: string };
}

interface LoginOutput {
  user: User;
  sessionToken: string;
}

@injectable()
export class LoginUseCase {
  constructor(
    @inject("ActivityLogRepository") private activityLogRepo: ActivityLogRepository,
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository,
    @inject("DeviceRepository") private deviceRepo: DeviceRepository,
    @inject("LoginAttemptRepository") private loginAttemptRepo: LoginAttemptRepository,
    @inject("DeviceSessionRepository") private deviceSessionRepo: DeviceSessionRepository,
    @inject("AuthService") private authService: AuthService,
    @inject("AppSettings") private settings: AppSettings,
    @inject("CaptchaService") private captchaService: CaptchaService
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const email = new Email(input.email);
    const clientIP = input.request.ip;

    // Layered anti-bruteforce (BUG-04): hitung kegagalan per EMAIL (semua IP),
    // bukan per (email, ip) — rotasi IP tidak bisa melewati counter.
    const failures = await this.loginAttemptRepo.countRecentFailures(email.value, LOGIN_FAILURE_WINDOW_MINUTES);

    // CAPTCHA in-app setelah beberapa kegagalan. Challenge dibuat on-demand dan
    // dikirim di response 428 — FE tinggal menampilkannya, tanpa endpoint terpisah.
    if (isCaptchaRequired(failures)) {
      const captchaOk = input.captcha
        ? await this.captchaService.verify(input.captcha.challengeId, input.captcha.answer)
        : false;
      if (!captchaOk) {
        // Catat kegagalan hanya kalau captcha SUDAH dikirim tapi salah — kalau
        // tidak dikirim sama sekali, itu bukan percobaan kredensial (jangan
        // menaikkan counter kegagalan user sah).
        if (input.captcha) {
          await this.loginAttemptRepo.recordFailedLogin(email.value, clientIP);
        }
        const challenge = await this.captchaService.createChallenge();
        throw new CaptchaRequiredError(
          input.captcha ? "Incorrect or expired CAPTCHA" : "Human verification required",
          challenge
        );
      }
    }

    // Progressive delay (bukan hard lock 15 menit) — user sah tidak pernah
    // terkunci keluar dari akunnya sendiri; brute force justru melambat.
    const delaySeconds = computeLoginDelaySeconds(failures);
    if (delaySeconds > 0) {
      await sleep(delaySeconds * 1000);
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

    const requireVerification = this.settings.requireEmailVerification;
    if (requireVerification && !user.emailVerified) {
      throw new AuthenticationError("Email not verified. Check your inbox.");
    }

    const requestForAuth = {
      ip: input.request.ip,
      headers: { "user-agent": input.request.headers["user-agent"] as string },
    };

    const result = await this.authService.establishAuthenticatedSession(user, requestForAuth, this.settings.deviceEnforcementEnabled);
    if (!result.ok) {
      // Blok device (BUG-09): 403 FORBIDDEN, bukan 401 — user & password sudah
      // benar, tapi device ini terikat ke akun lain / punya session aktif.
      throw new AuthorizationError(result.error, {
        ...(result.hasActiveSession ? { hasActiveSession: true } : {}),
      });
    }

    await this.activityLogRepo.logUserActivity({
      userId: user.id,
      action: "login",
      details: { email: user.email },
      ip: clientIP,
      userAgent: input.request.headers["user-agent"] as string ?? undefined,
    });

    return { user: result.user!, sessionToken: result.sessionToken! };
  }
}