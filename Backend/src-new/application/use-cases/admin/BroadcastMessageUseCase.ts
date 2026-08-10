import { inject, injectable } from "tsyringe";
import { pgClient } from "@data/orm/pgClient.js";
import { sendEmail } from "@domain/services/emailService.js";
import { logAdminAction } from "@domain/services/ActivityLogger.js";

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
  async execute(input: BroadcastMessageInput): Promise<BroadcastMessageOutput> {
    let targetUserIds: string[];

    if (input.recipients === "all") {
      const { rows } = await pgClient.query(
        `SELECT id FROM users WHERE status = 'active'`
      );
      targetUserIds = rows.map(r => r.id);
    } else {
      const { rows } = await pgClient.query(
        `SELECT id FROM users WHERE id = ANY($1) AND status = 'active'`,
        [input.recipients]
      );
      targetUserIds = rows.map(r => r.id);
      if (targetUserIds.length === 0) {
        throw new Error("No valid active recipients found");
      }
    }

    if (targetUserIds.length === 0) {
      throw new Error("No recipients found");
    }

    const values = targetUserIds.map((userId, i) =>
      `(NULL, $${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
    ).join(", ");

    const params: unknown[] = [];
    targetUserIds.forEach(userId => {
      params.push(userId, input.subject, input.body);
    });

    await pgClient.query(
      `INSERT INTO messages (from_user_id, to_user_id, subject, body) VALUES ${values}`,
      params
    );

    const { rows: recipientsWithEmail } = await pgClient.query(
      `SELECT u.email, u.name, COALESCE(mnp.email_enabled, true) as email_enabled
       FROM users u
       LEFT JOIN message_notification_preferences mnp ON u.id = mnp.user_id
       WHERE u.id = ANY($1) AND u.status = 'active'`,
      [targetUserIds]
    );

    const emailPromises = recipientsWithEmail
      .filter(r => r.email_enabled)
      .map(r => sendEmail({
        to: r.email,
        subject: `Admin Announcement: ${input.subject}`,
        text: `${input.body}\n\nThis is an admin broadcast message.`,
        html: `<p>${input.body.replace(/\n/g, "<br>")}</p><p><em>This is an admin broadcast message.</em></p>`,
      }).catch(err => console.error(`[broadcast] email to ${r.email} failed:`, err)));

    await Promise.allSettled(emailPromises);

    await logAdminAction({
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
      emailsSent: recipientsWithEmail.filter(r => r.email_enabled).length,
    };
  }
}