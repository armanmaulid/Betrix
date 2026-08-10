import type { ChatMessage, ChatTaskType } from "../entities/ChatMessage.js";

export interface ChatRepository {
  save(message: ChatMessage): Promise<ChatMessage>;
  findByUserId(userId: string, params: {
    limit: number;
    offset: number;
    taskType?: ChatTaskType;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{ messages: ChatMessage[]; total: number }>;
  findSessionsByUserId(userId: string, params: {
    limit: number;
    offset: number;
    taskType?: ChatTaskType;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{ sessions: Array<{ sessionId: string; start: Date; end: Date; title: string; turns: any[] }>; total: number }>;
  deleteSession(userId: string, sessionId: string): Promise<number>;
  findForExport(userId: string, params: {
    taskType?: ChatTaskType;
    startDate?: Date;
    endDate?: Date;
  }): Promise<ChatMessage[]>;
}