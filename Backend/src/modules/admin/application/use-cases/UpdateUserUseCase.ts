import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { UserStatus } from "@domain/entities/User.js";
import { NotFoundError, ValidationError } from "@core/errors/index.js";
import { INotifier } from "@domain/ports/INotifier.js";
import { ActivityLogRepository } from "@domain/repositories/ActivityLogRepository.js";
import { AdminActionType } from "@domain/entities/AdminAction.js";

interface UpdateUserInput {
  adminId: string;
  targetUserId: string;
  status?: UserStatus;
  isAdmin?: boolean;
  requestIp: string;
  requestUserAgent: string;
}

interface UpdateUserOutput {
  user: {
    id: string;
    email: string;
    name: string;
    isAdmin: boolean;
    status: UserStatus;
  };
}

@injectable()
export class UpdateUserUseCase {
  constructor(
    @inject("ActivityLogRepository") private activityLogRepo: ActivityLogRepository,
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository,
    @inject("INotifier") private notifier: INotifier
  ) {}

  async execute(input: UpdateUserInput): Promise<UpdateUserOutput> {
    if (input.targetUserId === input.adminId) {
      throw new ValidationError("Cannot modify your own account");
    }

    const user = await this.userRepo.findById(input.targetUserId);
    if (!user) {
      throw new NotFoundError("User");
    }

    let updatedUser = user;
    if (input.status !== undefined) {
      updatedUser = updatedUser.withStatus(input.status);
    }
    if (input.isAdmin !== undefined) {
      updatedUser = updatedUser.withIsAdmin(input.isAdmin);
    }

    if (updatedUser === user) {
      throw new ValidationError("No updates provided");
    }

    await this.userRepo.save(updatedUser);

    // Aksi admin paling sensitif (ban/suspend/reactivate + grant/revoke admin)
    // wajib tercatat di audit log — sebelumnya tidak ada trace sama sekali.
    await this.activityLogRepo.logAdminAction({
      adminId: input.adminId,
      action: AdminActionType.UPDATE_USER,
      targetType: "user",
      targetId: input.targetUserId,
      details: {
        statusChanged: input.status !== undefined,
        isAdminChanged: input.isAdmin !== undefined,
        newStatus: input.status,
        newIsAdmin: input.isAdmin,
      },
      ip: input.requestIp,
      userAgent: input.requestUserAgent,
    });

    // Revoke sessions if banned/suspended
    if (input.status === UserStatus.BANNED || input.status === UserStatus.SUSPENDED) {
      await this.sessionRepo.deleteByUserId(input.targetUserId);
      this.notifier.broadcastToUser(input.targetUserId, "logout", { reason: input.status });
    }

    return {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        isAdmin: updatedUser.isAdmin,
        status: updatedUser.status,
      },
    };
  }
}