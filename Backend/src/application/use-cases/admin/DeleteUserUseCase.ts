import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { NotFoundError, ValidationError } from "@core/errors/index.js";
import { ActivityLogRepository } from "@domain/repositories/ActivityLogRepository.js";

interface DeleteUserInput {
  adminId: string;
  targetUserId: string;
  requestIp: string;
  requestUserAgent: string;
}

@injectable()
export class DeleteUserUseCase {
  constructor(
    @inject("ActivityLogRepository") private activityLogRepo: ActivityLogRepository,
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository
  ) {}

  async execute(input: DeleteUserInput): Promise<void> {
    if (input.targetUserId === input.adminId) {
      throw new ValidationError("Cannot delete your own account");
    }

    const user = await this.userRepo.findById(input.targetUserId);
    if (!user) {
      throw new NotFoundError("User");
    }

    await this.userRepo.delete(input.targetUserId);

    // Revoke all active sessions for the deleted user immediately
    await this.sessionRepo.deleteByUserId(input.targetUserId);

    await this.activityLogRepo.logAdminAction({
      adminId: input.adminId,
      action: "delete_user",
      targetType: "user",
      targetId: input.targetUserId,
      details: { email: user.email },
      ip: input.requestIp,
      userAgent: input.requestUserAgent,
    });
  }
}