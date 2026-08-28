import { inject, injectable } from "tsyringe";
import { MessageRepository } from "@domain/repositories/MessageRepository.js";
import { NotFoundError } from "@core/errors/index.js";

@injectable()
export class GetMessageDetailUseCase {
  constructor(
    @inject("MessageRepository") private messageRepo: MessageRepository
  ) {}

  async execute(req: { id: string; userId: string }) {
    const message = await this.messageRepo.findById(req.id, req.userId);
    
    if (!message) {
      throw new NotFoundError("Message not found");
    }

    return {
      id: message.id,
      subject: message.subject,
      body: message.body,
      readAt: message.readAt,
      createdAt: message.createdAt,
      fromUserId: message.fromUserId,
      toUserId: message.toUserId,
      threadId: message.threadId
    };
  }
}
