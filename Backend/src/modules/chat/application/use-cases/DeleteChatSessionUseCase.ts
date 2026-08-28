import { inject, injectable } from "tsyringe";
import { ChatRepository } from "@domain/repositories/ChatRepository.js";

interface DeleteChatSessionInput {
  userId: string;
  sessionId: string;
}

interface DeleteChatSessionOutput {
  deleted: number;
}

@injectable()
export class DeleteChatSessionUseCase {
  constructor(
    @inject("ChatRepository") private chatRepo: ChatRepository
  ) {}

  async execute(input: DeleteChatSessionInput): Promise<DeleteChatSessionOutput> {
    const deleted = await this.chatRepo.deleteSession(input.userId, input.sessionId);
    if (deleted === 0) {
      throw new Error("Chat session not found");
    }
    return { deleted };
  }
}