import { inject, injectable } from "tsyringe";
import { MessageRepository } from "@domain/repositories/MessageRepository.js";

@injectable()
export class GetMessageThreadUseCase {
  constructor(
    @inject("MessageRepository") private messageRepo: MessageRepository
  ) {}

  async execute(req: { threadId: string; userId: string }) {
    const messages = await this.messageRepo.findThread(req.threadId, req.userId);

    return {
      messages: messages.map(m => ({
        id: m.id,
        subject: m.subject,
        body: m.body,
        readAt: m.readAt,
        createdAt: m.createdAt,
        replyToMessageId: m.replyToMessageId,
        fromUserId: m.fromUserId,
        toUserId: m.toUserId
      }))
    };
  }
}
