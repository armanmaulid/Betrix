import { inject, injectable } from "tsyringe";
import { ChatRepository, ChatSessionTurn } from "@domain/repositories/ChatRepository.js";
import { ChatTaskType } from "@domain/entities/ChatMessage.js";

interface GetChatHistoryInput {
  userId: string;
  limit: number;
  offset: number;
  taskType?: ChatTaskType;
  startDate?: Date;
  endDate?: Date;
}

interface ChatHistoryOutput {
  data: Array<{
    sessionId: string;
    sessionStart: Date;
    createdAt: Date;
    title: string;
    turns: ChatSessionTurn[];
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

@injectable()
export class GetChatHistoryUseCase {
  constructor(
    @inject("ChatRepository") private chatRepo: ChatRepository
  ) {}

  async execute(input: GetChatHistoryInput): Promise<ChatHistoryOutput> {
    const result = await this.chatRepo.findSessionsByUserId(input.userId, {
      limit: input.limit,
      offset: input.offset,
      taskType: input.taskType,
      startDate: input.startDate,
      endDate: input.endDate,
    });

    return {
      data: result.sessions.map(s => ({
        sessionId: s.sessionId,
        sessionStart: s.start,
        createdAt: s.end,
        title: s.title,
        turns: s.turns,
      })),
      pagination: {
        total: result.total,
        limit: input.limit,
        offset: input.offset,
        hasMore: input.offset + input.limit < result.total,
      },
    };
  }
}