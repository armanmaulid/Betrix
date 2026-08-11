import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { NotFoundError, ValidationError } from "@core/errors/index.js";
import { pgClient } from "@data/orm/pgClient.js";
import { logAdminAction } from "@domain/services/ActivityLogger.js";

interface DeleteUserInput {
  adminId: string;
  targetUserId: string;
  requestIp: string;
  requestUserAgent: string;
}

@injectable()
export class DeleteUserUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository
  ) {}

  async execute(input: DeleteUserInput): Promise<void> {
    if (input.targetUserId === input.adminId) {
      throw new ValidationError("Cannot delete your own account");
    }

    const { rows } = await pgClient.query(
      `DELETE FROM users WHERE id = $1 RETURNING email`,
      [input.targetUserId]
    );

    if (rows.length === 0) {
      throw new NotFoundError("User");
    }

    // Revoke all active sessions for the deleted user immediately
    await this.sessionRepo.deleteByUserId(input.targetUserId);

    await logAdminAction({
      adminId: input.adminId,
      action: "delete_user",
      targetType: "user",
      targetId: input.targetUserId,
      details: { email: rows[0].email },
      ip: input.requestIp,
      userAgent: input.requestUserAgent,
    });
  }
}