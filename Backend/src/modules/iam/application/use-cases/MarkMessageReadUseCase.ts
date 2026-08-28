import { inject, injectable } from "tsyringe";
import { MessageRepository } from "@domain/repositories/MessageRepository.js";
import { NotFoundError, AuthorizationError } from "@core/errors/index.js";

@injectable()
export class MarkMessageReadUseCase {
  constructor(
    @inject("MessageRepository") private messageRepo: MessageRepository
  ) {}

  async execute(req: { id: string; userId: string }) {
    const message = await this.messageRepo.findById(req.id, req.userId);
    if (!message) {
      throw new NotFoundError("Message not found");
    }

    if (message.toUserId !== req.userId) {
      throw new AuthorizationError("Only receiver can mark message as read");
    }

    if (message.readAt) {
      return { message: "Message already marked as read" };
    }

    await this.messageRepo.markAsRead(req.id, req.userId);
    
    return { message: "Message marked as read" };
  }
}
