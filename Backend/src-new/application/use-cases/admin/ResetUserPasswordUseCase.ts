import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { User } from "@domain/entities/User.js";
import { NotFoundError, ValidationError } from "@core/errors/index.js";
import { pgClient } from "@data/orm/pgClient.js";
import { broadcastToUser } from "@domain/services/sseManager.js";
import { sendEmail } from "@domain/services/emailService.js";
import { hashPassword, generateSecureToken } from "@core/utils/index.js";
import { logAdminAction } from "@domain/services/ActivityLogger.js";

interface ResetUserPasswordInput {
  adminId: string;
  targetUserId: string;
  sendEmail: boolean;
  request: { ip: string; headers: { "user-agent": string } };
}

interface ResetUserPasswordOutput {
  tempPassword: string | undefined;
  emailSent: boolean;
  user: { id: string; email: string };
}

@injectable()
export class ResetUserPasswordUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository
  ) {}

  async execute(input: ResetUserPasswordInput): Promise<ResetUserPasswordOutput> {
    if (input.targetUserId === input.adminId) {
      throw new ValidationError("Cannot reset your own password");
    }

    const user = await this.userRepo.findById(input.targetUserId);
    if (!user) {
      throw new NotFoundError("User");
    }

    const tempPassword = generateSecureToken(8);
    const hashedPassword = await hashPassword(tempPassword);

    await pgClient.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2`,
      [hashedPassword, input.targetUserId]
    );

    await this.sessionRepo.deleteByUserId(input.targetUserId);
    broadcastToUser(input.targetUserId, "logout", { reason: "password_reset" });

    let emailSent = false;
    if (input.sendEmail) {
      try {
        await sendEmail({
          to: user.email,
          subject: "Your Password Has Been Reset",
          text: `Hello ${user.name || user.email},\n\nAn administrator has reset your password. Your temporary password is:\n\n${tempPassword}\n\nPlease log in and change your password immediately.\n\nIf you did not request this, contact support immediately.`,
          html: `<p>Hello ${user.name || user.email},</p><p>An administrator has reset your password. Your temporary password is:</p><div style="background:#f5f5f5;padding:15px;border-radius:5px;margin:20px 0;"><strong style="font-size:18px;font-family:monospace;">${tempPassword}</strong></div><p><strong>Important:</strong> Please log in and change your password immediately.</p><p>If you did not request this, contact support immediately.</p>`,
        });
        emailSent = true;
      } catch (err) {
        console.error("[ResetUserPassword] email failed:", err);
      }
    }

    await logAdminAction({
      adminId: input.adminId,
      action: "reset_password",
      targetType: "user",
      targetId: input.targetUserId,
      details: { email: user.email, emailSent },
      ip: input.request.ip,
      userAgent: input.request.headers["user-agent"] ?? null,
    });

    return {
      tempPassword: input.sendEmail ? undefined : tempPassword,
      emailSent,
      user: { id: user.id, email: user.email },
    };
  }
}