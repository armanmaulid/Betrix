import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { MessageRepository } from "@domain/repositories/MessageRepository.js";
import type { EmailPort } from "@domain/ports/index.js";
import { Message } from "@domain/entities/Message.js";
import { randomUUID } from "crypto";
import { Email } from "@domain/value-objects/index.js";

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
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("MessageRepository") private messageRepo: MessageRepository,
    @inject("EmailPort") private emailPort: EmailPort
  ) {}

  async execute(input: SendMessageInput): Promise<SendMessageOutput> {
    const recipient = await this.userRepo.findByEmail(new Email(input.toEmail));

    if (!recipient) {
      throw new Error("Recipient not found");
    }

    if (recipient.status !== "active") {
      throw new Error("Cannot send message to inactive user");
    }

    if (recipient.id === input.fromUserId) {
      throw new Error("Cannot send message to yourself");
    }

    let threadId: string | null = null;
    let validReplyToMessageId: string | null = null;

    if (input.replyToMessageId) {
      const originalMessage = await this.messageRepo.findById(input.replyToMessageId, input.fromUserId);
      if (originalMessage) {
        threadId = originalMessage.threadId;
        validReplyToMessageId = originalMessage.id;
      } else {
        throw new Error("Invalid replyToMessageId");
      }
    }

    const msgId = randomUUID();
    const newMessage = new Message(
      msgId,
      input.fromUserId,
      recipient.id,
      input.subject,
      input.body,
      null,
      threadId || msgId,
      validReplyToMessageId,
      null,
      new Date()
    );

    const savedMessage = await this.messageRepo.save(newMessage);

    // Send email notification if enabled
    const emailEnabled = await this.messageRepo.getNotificationPreference(recipient.id);
    if (emailEnabled) {
      await this.emailPort.sendEmail({
        to: recipient.email,
        subject: `New Message: ${input.subject}`,
        text: `You have a new message from ${input.fromUserId}.\n\n${input.body}`,
        html: `<p>You have a new message.</p><p>${input.body.replace(/\n/g, "<br>")}</p>`,
      }).catch(err => console.error("[SendMessage] email failed:", err));
    }

    return { id: savedMessage.id, createdAt: savedMessage.createdAt };
  }
}