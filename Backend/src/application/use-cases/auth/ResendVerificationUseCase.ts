import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { VerificationRepository } from "@domain/repositories/VerificationRepository.js";
import { EmailPort } from "@domain/ports";
import { Email } from "@domain/value-objects";
import { ValidationError } from "@core/errors/index.js";
import { generateOTP } from "@core/utils/index.js";

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
    const token = generateOTP();
    await this.verificationRepo.create(user.id, token, 24 * 60 * 60);
    await this.emailPort.sendVerificationEmail(email.value, token);
  }
}