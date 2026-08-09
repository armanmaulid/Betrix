import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { User, UserStatus } from "@domain/entities/User.js";
import { NotFoundError, ValidationError } from "@core/errors/index.js";
import { pgClient } from "@data/orm/pgClient.js";
import { broadcastToUser } from "@domain/services/sseManager.js";
import { sendEmail } from "@domain/services/emailService.js";
import { hashPassword, generateSecureToken } from "@core/utils/index.js";
import { logAdminAction } from "@domain/services/ActivityLogger.js";

interface DeleteUserInput {
  adminId: string;
  targetUserId: string;
  request: { ip: string; headers: { "user-agent": string } };
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

    await logAdminAction({
      adminId: input.adminId,
      action: "delete_user",
      targetType: "user",
      targetId: input.targetUserId,
      details: { email: rows[0].email },
      ip: input.request.ip,
      userAgent: input.request.headers["user-agent"] ?? null,
    });
  }
}