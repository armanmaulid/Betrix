import { inject, injectable } from "tsyringe";
import { MessageRepository } from "@domain/repositories/MessageRepository.js";

interface GetMessagesInput {
  userId: string;
  limit: number;
  offset: number;
  unread?: boolean;
  search?: string;
}

interface GetMessagesOutput {
  messages: Array<{
    id: string;
    subject: string;
    body: string;
    readAt: Date | null;
    createdAt: Date;
    threadId: string;
    from: { id: string | null; email: string; name: string };
    to: { id: string; email: string; name: string };
  }>;
  unreadCount: number;
  total: number;
}

@injectable()
export class GetMessagesUseCase {
  constructor(@inject("MessageRepository") private messageRepo: MessageRepository) {}

  async execute(input: GetMessagesInput): Promise<GetMessagesOutput> {
    const { messages, total, unreadCount } = await this.messageRepo.findInbox(input.userId, {
      limit: input.limit,
      offset: input.offset,
      unread: input.unread,
      search: input.search,
    });

    return {
      messages: messages.map(r => ({
        id: r.id,
        subject: r.subject,
        body: r.body,
        readAt: r.readAt,
        createdAt: r.createdAt,
        threadId: r.threadId,
        from: { id: r.fromUserId, email: r.fromUserId ? "unknown" : "system", name: r.fromUserId ? "Unknown" : "System Administrator" },
        to: { id: input.userId, email: "", name: "" },
      })),
      unreadCount,
      total,
    };
  }
}