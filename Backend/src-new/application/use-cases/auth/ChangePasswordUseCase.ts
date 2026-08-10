import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { User } from "@domain/entities/User.js";
import { ValidationError, AuthenticationError, NotFoundError } from "@core/errors/index.js";
import { verifyPassword, hashPassword } from "@core/utils/index.js";
import { logUserActivity } from "@domain/services/ActivityLogger.js";
import { RequestInput } from "@core/utils/request.js";
import { pgClient } from "@data/orm/pgClient.js";

interface ChangePasswordInput {
  userId: string;
  sessionToken: string;
  currentPassword: string;
  newPassword: string;
  request: RequestInput;
}

interface ChangePasswordOutput {
  user: User;
}

@injectable()
export class ChangePasswordUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository
  ) {}

  async execute(input: ChangePasswordInput): Promise<ChangePasswordOutput> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    if (!user.passwordHash) {
      throw new ValidationError("Cannot change password for Google-only account");
    }

    const isValid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new AuthenticationError("Current password is incorrect");
    }

    const newHash = await hashPassword(input.newPassword);
    await pgClient.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2`,
      [newHash, user.id]
    );

    // Revoke all other sessions
    await this.sessionRepo.deleteByUserId(user.id, input.sessionToken);

    await logUserActivity({
      userId: user.id,
      action: "password_changed",
      ip: input.request.ip,
      userAgent: input.request.userAgent ?? null,
    });

    const updatedUser = await this.userRepo.findById(user.id);
    if (!updatedUser) {
      throw new NotFoundError("User after password change");
    }
    return { user: updatedUser };
  }
}