import { inject, injectable } from "tsyringe";
import { MessageRepository } from "@domain/repositories/MessageRepository.js";
import { NotFoundError } from "@core/errors/index.js";

@injectable()
export class DeleteMessageUseCase {
  constructor(
    @inject("MessageRepository") private messageRepo: MessageRepository
  ) {}

  async execute(req: { id: string; userId: string }) {
    const message = await this.messageRepo.findById(req.id, req.userId);
    if (!message || message.deletedAt) {
      throw new NotFoundError("Message not found or already deleted");
    }

    await this.messageRepo.softDelete(req.id, req.userId);
    
    return { message: "Message deleted" };
  }
}
