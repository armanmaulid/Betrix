import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { VerificationRepository } from "@domain/repositories/VerificationRepository.js";
import { EmailPort } from "@application/ports";
import { User } from "@domain/entities/User.js";
import { Email } from "@domain/value-objects";
import { ValidationError, AuthenticationError, NotFoundError, ConflictError } from "@core/errors/index.js";
import { verifyPassword, generateOTP } from "@core/utils/index.js";
import { LIMITS } from "@core/constants/index.js";
import { RequestInput } from "@core/utils/request.js";

interface ChangeEmailInput {
  userId: string;
  currentPassword: string;
  newEmail: string;
  request: RequestInput;
}

interface ChangeEmailOutput {
  user: User;
  pendingEmail: string;
}

@injectable()
export class ChangeEmailUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("VerificationRepository") private verificationRepo: VerificationRepository,
    @inject("EmailPort") private emailPort: EmailPort
  ) {}

  async execute(input: ChangeEmailInput): Promise<ChangeEmailOutput> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    const newEmail = new Email(input.newEmail);
    if (newEmail.value.toLowerCase() === user.email.toLowerCase()) {
      throw new ValidationError("New email must be different from current email");
    }

    if (!user.passwordHash) {
      throw new ValidationError("Cannot change email for Google-only account");
    }

    const isValid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new AuthenticationError("Current password is incorrect");
    }

    const existing = await this.userRepo.findByEmail(newEmail);
    if (existing && existing.id !== user.id) {
      throw new ConflictError("Email already in use");
    }

    await this.verificationRepo.invalidateUserTokens(user.id);
    const token = generateOTP();
    await this.verificationRepo.create(user.id, token, 86400, newEmail.value);
    await this.emailPort.sendEmailChangeVerification(newEmail.value, token);

    return { user, pendingEmail: newEmail.value };
  }
}