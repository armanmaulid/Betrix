import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { User, UserStatus } from "@domain/entities/User.js";
import { NotFoundError, ValidationError } from "@core/errors/index.js";
import { pgClient } from "@data/orm/pgClient.js";
import { broadcastToUser } from "@domain/services/sseManager.js";

interface UpdateUserInput {
  adminId: string;
  targetUserId: string;
  status?: UserStatus;
  isAdmin?: boolean;
  request: { ip: string; headers: { "user-agent": string } };
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
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository
  ) {}

  async execute(input: UpdateUserInput): Promise<UpdateUserOutput> {
    if (input.targetUserId === input.adminId) {
      throw new ValidationError("Cannot modify your own account");
    }

    const user = await this.userRepo.findById(input.targetUserId);
    if (!user) {
      throw new NotFoundError("User");
    }

    const updates: Partial<Pick<User, "status" | "isAdmin">> = {};
    if (input.status !== undefined) updates.status = input.status;
    if (input.isAdmin !== undefined) updates.isAdmin = input.isAdmin;

    if (Object.keys(updates).length === 0) {
      throw new ValidationError("No updates provided");
    }

    const updatedUser = await this.userRepo.updateStatus(input.targetUserId, updates.status!);
    if (updates.isAdmin !== undefined) {
      await pgClient.query(
        `UPDATE users SET is_admin = $1 WHERE id = $2`,
        [updates.isAdmin, input.targetUserId]
      );
    }

    // Revoke sessions if banned/suspended
    if (input.status === UserStatus.BANNED || input.status === UserStatus.SUSPENDED) {
      await this.sessionRepo.deleteByUserId(input.targetUserId);
      broadcastToUser(input.targetUserId, "logout", { reason: input.status });
    }

    return {
      user: {
        id: updatedUser!.id,
        email: updatedUser!.email,
        name: updatedUser!.name,
        isAdmin: updates.isAdmin ?? updatedUser!.isAdmin,
        status: updatedUser!.status,
      },
    };
  }
}