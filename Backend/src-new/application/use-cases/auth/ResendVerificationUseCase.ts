import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { VerificationRepository } from "@domain/repositories/VerificationRepository.js";
import { EmailPort } from "@application/ports";
import { User } from "@domain/entities/User.js";
import { Email } from "@domain/value-objects";
import { ValidationError, NotFoundError } from "@core/errors/index.js";
import { generateSecureToken } from "@core/utils/index.js";
import { LIMITS } from "@core/constants/index.js";

interface ResendVerificationInput {
  email: string;
}

@injectable()
export class ResendVerificationUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("VerificationRepository") private verificationRepo: VerificationRepository,
    @inject("EmailPort") private emailPort: EmailPort
  ) {}

  async execute(input: ResendVerificationInput): Promise<void> {
    const email = new Email(input.email);
    const user = await this.userRepo.findByEmail(email);

    if (!user) {
      return; // Don't reveal if email exists
    }

    if (user.emailVerified) {
      throw new ValidationError("Email already verified");
    }

    await this.verificationRepo.invalidateUserTokens(user.id);
    const token = generateSecureToken(LIMITS.VERIFICATION_TOKEN_BYTES);
    await this.verificationRepo.create(user.id, token, 24 * 60 * 60);
    await this.emailPort.sendVerificationEmail(email.value, token);
  }
}