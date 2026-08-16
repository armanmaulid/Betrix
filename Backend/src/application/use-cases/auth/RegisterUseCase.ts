import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { DeviceRepository } from "@domain/repositories/DeviceRepository.js";
import { VerificationRepository } from "@domain/repositories/VerificationRepository.js";
import { EmailPort } from "@domain/ports";
import { User } from "@domain/entities/User.js";
import { Session } from "@domain/entities/Session.js";
import { Device } from "@domain/entities/Device.js";
import { Email, DeviceFingerprint } from "@domain/value-objects";
import { ValidationError, ConflictError } from "@core/errors/index.js";
import { hashPassword, generateOTP, generateSecureToken } from "@core/utils/index.js";
import type { AppSettings } from "@core/settings/AppSettings.js";
import { LIMITS } from "@core/constants/index.js";
import { RequestInput } from "@core/utils/request.js";

interface RegisterInput {
  email: string;
  password: string;
  name?: string;
  request: RequestInput;
}

interface RegisterOutput {
  user: User;
  sessionToken: string;
}

@injectable()
export class RegisterUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository,
    @inject("DeviceRepository") private deviceRepo: DeviceRepository,
    @inject("VerificationRepository") private verificationRepo: VerificationRepository,
    @inject("EmailPort") private emailPort: EmailPort,
    @inject("AppSettings") private settings: AppSettings
  ) {}

  async execute(input: RegisterInput): Promise<RegisterOutput> {
    const email = new Email(input.email);
    
    if (input.password.length < LIMITS.PASSWORD_MIN_LENGTH) {
      throw new ValidationError("Password must be at least 8 characters");
    }

    if (this.settings.deviceEnforcementEnabled) {
      const fingerprint = DeviceFingerprint.create(input.request);
      const existingUserId = await this.deviceRepo.findUserByFingerprint(fingerprint);
      if (existingUserId) {
        throw new ConflictError("This device is already registered to another account");
      }
    }

    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser) {
      await this.emailPort.sendDuplicateRegistrationNotice(existingUser.email);
      return { user: existingUser, sessionToken: "" };
    }

    const passwordHash = await hashPassword(input.password);
    const user = User.create({
      id: generateSecureToken(16),
      email: email.value,
      passwordHash,
      name: input.name ?? "",
    });

    await this.userRepo.save(user);

    if (this.settings.deviceEnforcementEnabled) {
      const fingerprint = DeviceFingerprint.create(input.request);
      const bound = await this.deviceRepo.bind(Device.create({ userId: user.id, fingerprint: fingerprint.value }));
      if (!bound) {
        // Race TOCTOU (BUG-09): device direbut akun lain antara cek & bind →
        // rollback user yang baru dibuat, laporkan konflik (bukan rampasan senyap).
        await this.userRepo.delete(user.id);
        throw new ConflictError("This device is already registered to another account");
      }
    }

    const token = generateOTP();
    await this.verificationRepo.create(user.id, token, 24 * 60 * 60);
    await this.emailPort.sendVerificationEmail(email.value, token);

    const sessionToken = generateSecureToken(LIMITS.SESSION_TOKEN_BYTES);
    await this.sessionRepo.save(Session.create({
      userId: user.id,
      token: sessionToken,
      deviceFingerprint: this.settings.deviceEnforcementEnabled ? DeviceFingerprint.create(input.request).value : null,
      ip: input.request.ip,
      userAgent: input.request.userAgent,
    }));

    return { user, sessionToken };
  }
}