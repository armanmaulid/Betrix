import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { User } from "@domain/entities/User.js";
import { ValidationError, AuthenticationError, NotFoundError } from "@core/errors/index.js";
import { verifyPassword, hashPassword } from "@core/utils/index.js";
import { logUserActivity } from "@domain/services/ActivityLogger.js";

interface ChangePasswordInput {
  userId: string;
  sessionToken: string;
  currentPassword: string;
  newPassword: string;
  request: { ip: string; headers: { "user-agent": string } };
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
    const updatedUser = user.withCredits(user.credits); // Create new instance
    // Actually we need to update password hash directly
    const { pgClient } = await import("@data/orm/pgClient.js");
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
      userAgent: input.request.headers["user-agent"] ?? null,
    });

    // Send notification email (fire and forget)
    // This would be done via EmailPort in a real implementation

    return { user: await this.userRepo.findById(user.id)! };
  }
}