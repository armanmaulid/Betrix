import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { User } from "@domain/entities/User.js";
import { NotFoundError, ValidationError } from "@core/errors/index.js";
import { INotifier } from "@application/ports/INotifier.js";
import { sendEmail } from "@domain/services/emailService.js";
import { hashPassword, generateSecureToken } from "@core/utils/index.js";
import { ActivityLogRepository } from "@domain/repositories/ActivityLogRepository.js";

interface ResetUserPasswordInput {
  adminId: string;
  targetUserId: string;
  sendEmail: boolean;
  requestIp: string;
  requestUserAgent: string;
}

interface ResetUserPasswordOutput {
  tempPassword: string | undefined;
  emailSent: boolean;
  user: { id: string; email: string };
}

@injectable()
export class ResetUserPasswordUseCase {
  constructor(
    @inject("ActivityLogRepository") private activityLogRepo: ActivityLogRepository,
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository,
    @inject("INotifier") private notifier: INotifier
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

    await this.userRepo.updatePassword(input.targetUserId, hashedPassword);

    await this.sessionRepo.deleteByUserId(input.targetUserId);
    this.notifier.broadcastToUser(input.targetUserId, "logout", { reason: "password_reset" });

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

    await this.activityLogRepo.logAdminAction({
      adminId: input.adminId,
      action: "reset_password",
      targetType: "user",
      targetId: input.targetUserId,
      details: { email: user.email, emailSent },
      ip: input.requestIp,
      userAgent: input.requestUserAgent,
    });

    return {
      tempPassword: input.sendEmail ? undefined : tempPassword,
      emailSent,
      user: { id: user.id, email: user.email },
    };
  }
}