import { inject, injectable } from "tsyringe";
import { pgClient } from "@data/orm/pgClient.js";
import { sendEmail } from "@domain/services/emailService.js";
import { User } from "@domain/entities/User.js";

interface SendMessageInput {
  fromUserId: string;
  toEmail: string;
  subject: string;
  body: string;
  replyToMessageId?: string;
}

interface SendMessageOutput {
  id: string;
  createdAt: Date;
}

@injectable()
export class SendMessageUseCase {
  async execute(input: SendMessageInput): Promise<SendMessageOutput> {
    const { rows: recipientRows } = await pgClient.query(
      `SELECT id, email, name, status FROM users WHERE email = $1`,
      [input.toEmail.toLowerCase().trim()]
    );

    if (recipientRows.length === 0) {
      throw new Error("Recipient not found");
    }

    if (recipientRows[0].status !== "active") {
      throw new Error("Cannot send message to inactive user");
    }

    const recipient = recipientRows[0];

    if (recipient.id === input.fromUserId) {
      throw new Error("Cannot send message to yourself");
    }

    let threadId: string | null = null;
    let validReplyToMessageId: string | null = null;

    if (input.replyToMessageId) {
      const { rows: originalRows } = await pgClient.query(
        `SELECT thread_id FROM messages WHERE id = $1 AND (from_user_id = $2 OR to_user_id = $2)`,
        [input.replyToMessageId, input.fromUserId]
      );
      if (originalRows.length > 0) {
        threadId = originalRows[0].thread_id;
        validReplyToMessageId = input.replyToMessageId;
      } else {
        throw new Error("Invalid replyToMessageId");
      }
    }

    const client = await pgClient.connect();
    let message: { id: string; created_at: Date } | null = null;
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO messages (from_user_id, to_user_id, subject, body, reply_to_message_id, thread_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, created_at`,
        [input.fromUserId, recipient.id, input.subject, input.body, validReplyToMessageId, threadId]
      );
      message = rows[0];

      if (!threadId) {
        await client.query(
          `UPDATE messages SET thread_id = id WHERE id = $1`,
          [message.id]
        );
      }
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    // Send email notification if enabled
    const { rows: prefRows } = await pgClient.query(
      `SELECT email_enabled FROM message_notification_preferences WHERE user_id = $1`,
      [recipient.id]
    );
    if (prefRows.length === 0 || prefRows[0].email_enabled) {
      await sendEmail({
        to: recipient.email,
        subject: `New Message: ${input.subject}`,
        text: `You have a new message from ${input.fromUserId}.\n\n${input.body}`,
        html: `<p>You have a new message.</p><p>${input.body.replace(/\n/g, "<br>")}</p>`,
      }).catch(err => console.error("[SendMessage] email failed:", err));
    }

    return { id: message!.id, createdAt: message!.created_at };
  }
}