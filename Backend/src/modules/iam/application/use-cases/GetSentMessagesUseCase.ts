import { inject, injectable } from "tsyringe";
import { MessageRepository } from "@domain/repositories/MessageRepository.js";

interface GetSentMessagesRequest {
  userId: string;
  limit?: number;
  offset?: number;
  search?: string;
}

@injectable()
export class GetSentMessagesUseCase {
  constructor(
    @inject("MessageRepository") private messageRepo: MessageRepository
  ) {}

  async execute(req: GetSentMessagesRequest) {
    const limit = Math.min(Math.max(req.limit || 50, 1), 100);
    const offset = Math.max(req.offset || 0, 0);

    const result = await this.messageRepo.findSent(req.userId, {
      limit,
      offset,
      search: req.search
    });

    return {
      messages: result.messages.map(m => ({
        id: m.id,
        subject: m.subject,
        body: m.body,
        readAt: m.readAt,
        createdAt: m.createdAt,
        threadId: m.threadId,
        to: m.toUserId
      })),
      pagination: {
        limit,
        offset,
        total: result.total
      }
    };
  }
}
