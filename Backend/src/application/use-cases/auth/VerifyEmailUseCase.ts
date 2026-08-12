import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { VerificationRepository } from "@domain/repositories/VerificationRepository.js";
import { EmailPort } from "@application/ports";
import { User, UserStatus } from "@domain/entities/User.js";
import { Email } from "@domain/value-objects";
import { ValidationError, NotFoundError, InternalError } from "@core/errors/index.js";
import { verifyPassword, hashPassword, generateSecureToken } from "@core/utils/index.js";
import { LIMITS } from "@core/constants/index.js";

interface VerifyEmailInput {
  token: string;
}

interface VerifyEmailOutput {
  user: User;
}

@injectable()
export class VerifyEmailUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("VerificationRepository") private verificationRepo: VerificationRepository,
    @inject("EmailPort") private emailPort: EmailPort
  ) {}

  async execute(input: VerifyEmailInput): Promise<VerifyEmailOutput> {
    const result = await this.verificationRepo.verify(input.token);
    if (!result.success) {
      throw new ValidationError(result.error || "Token invalid or expired");
    }

    const user = await this.userRepo.findById(result.userId!);
    if (!user) {
      throw new NotFoundError("User");
    }

    const verifiedUser = result.newEmail 
      ? user.withEmail(result.newEmail)
      : user.withEmailVerified();
    
    await this.userRepo.save(verifiedUser);

    if (result.newEmail) {
      await this.emailPort.sendEmailChangeNotification(user.email, result.newEmail);
    }

    return { user: verifiedUser };
  }
}