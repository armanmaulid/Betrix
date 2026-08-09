import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { DeviceRepository } from "@domain/repositories/DeviceRepository.js";
import { VerificationRepository } from "@domain/repositories/VerificationRepository.js";
import { EmailPort } from "@application/ports/EmailPort.js";
import { User, UserStatus } from "@domain/entities/User.js";
import { Email } from "@domain/value-objects/Email.js";
import { DeviceFingerprint } from "@domain/value-objects/DeviceFingerprint.js";
import { ValidationError, ConflictError, InternalError } from "@core/errors/index.js";
import { hashPassword, generateSecureToken, getDeviceFingerprint } from "@core/utils/index.js";
import { isDeviceEnforcementEnabled } from "@config/deviceEnforcement.js";
import { LIMITS } from "@core/constants/index.js";

interface RegisterInput {
  email: string;
  password: string;
  name?: string;
  request: { ip: string; headers: { "user-agent": string } };
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
    @inject("EmailPort") private emailPort: EmailPort
  ) {}

  async execute(input: RegisterInput): Promise<RegisterOutput> {
    const email = new Email(input.email);
    
    if (input.password.length < LIMITS.PASSWORD_MIN_LENGTH) {
      throw new ValidationError("Password must be at least 8 characters");
    }

    if (isDeviceEnforcementEnabled()) {
      const fingerprint = new DeviceFingerprint(getDeviceFingerprint(input.request));
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

    if (isDeviceEnforcementEnabled()) {
      const fingerprint = new DeviceFingerprint(getDeviceFingerprint(input.request));
      await this.deviceRepo.bind(Device.create({ userId: user.id, fingerprint }));
    }

    const token = generateSecureToken(LIMITS.VERIFICATION_TOKEN_BYTES);
    await this.verificationRepo.create(user.id, token, 24 * 60 * 60);
    await this.emailPort.sendVerificationEmail(email.value, token);

    const sessionToken = generateSecureToken(LIMITS.SESSION_TOKEN_BYTES);
    await this.sessionRepo.save(Session.create({
      userId: user.id,
      token: sessionToken,
      deviceFingerprint: isDeviceEnforcementEnabled() ? getDeviceFingerprint(input.request) : null,
      ip: input.request.ip,
      userAgent: input.request.headers["user-agent"],
    }));

    return { user, sessionToken };
  }
}