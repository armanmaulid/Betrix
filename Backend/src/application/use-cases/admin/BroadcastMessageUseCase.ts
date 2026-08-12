import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { MessageRepository } from "@domain/repositories/MessageRepository.js";
import { Message } from "@domain/entities/Message.js";
import { sendEmail } from "@domain/services/emailService.js";
import { ActivityLogRepository } from "@domain/repositories/ActivityLogRepository.js";
import { randomUUID } from "crypto";

interface BroadcastMessageInput {
  adminId: string;
  subject: string;
  body: string;
  recipients: "all" | string[];
  requestIp: string;
  requestUserAgent: string;
}

interface BroadcastMessageOutput {
  recipientCount: number;
  emailsSent: number;
}

@injectable()
export class BroadcastMessageUseCase {
  constructor(
    @inject("ActivityLogRepository") private activityLogRepo: ActivityLogRepository,
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("MessageRepository") private messageRepo: MessageRepository
  ) {}

  async execute(input: BroadcastMessageInput): Promise<BroadcastMessageOutput> {
    let targetUserIds: string[];

    if (input.recipients === "all") {
      const { users } = await this.userRepo.findAll({
        page: 1, limit: 10000, status: "active" as any, sortBy: "created_at", order: "DESC"
      });
      targetUserIds = users.map(u => u.id);
    } else {
      // Validate recipients
      targetUserIds = [];
      for (const id of input.recipients) {
        const u = await this.userRepo.findById(id);
        if (u && u.status === "active") targetUserIds.push(u.id);
      }
      if (targetUserIds.length === 0) {
        throw new Error("No valid active recipients found");
      }
    }

    if (targetUserIds.length === 0) {
      throw new Error("No recipients found");
    }

    const messagesToSave: Message[] = targetUserIds.map(userId => {
      const msgId = randomUUID();
      return new Message(
        msgId, null, userId, input.subject, input.body, null, msgId, null, null, new Date()
      );
    });

    await this.messageRepo.saveMany(messagesToSave);

    let emailsSent = 0;
    
    // We fetch user details and preferences sequentially for email to avoid too many parallel queries if there's a lot of users.
    // In a real app this should be enqueued to a background job queue.
    const emailPromises = targetUserIds.map(async (userId) => {
      const user = await this.userRepo.findById(userId);
      if (!user) return;
      const emailEnabled = await this.messageRepo.getNotificationPreference(userId);
      if (emailEnabled && user.email) {
        try {
          await sendEmail({
            to: user.email,
            subject: `Admin Announcement: ${input.subject}`,
            text: `${input.body}\n\nThis is an admin broadcast message.`,
            html: `<p>${input.body.replace(/\n/g, "<br>")}</p><p><em>This is an admin broadcast message.</em></p>`,
          });
          emailsSent++;
        } catch (err) {
          console.error(`[broadcast] email to ${user.email} failed:`, err);
        }
      }
    });

    await Promise.allSettled(emailPromises);

    await this.activityLogRepo.logAdminAction({
      adminId: input.adminId,
      action: "broadcast_message",
      targetType: "system",
      targetId: undefined,
      details: {
        subject: input.subject,
        recipientCount: targetUserIds.length,
        recipientType: input.recipients === "all" ? "all_users" : "selected_users",
      },
      ip: input.requestIp,
      userAgent: input.requestUserAgent ?? undefined,
    });

    return {
      recipientCount: targetUserIds.length,
      emailsSent,
    };
  }
}