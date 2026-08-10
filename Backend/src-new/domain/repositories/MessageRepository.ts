import type { Message } from "../entities/Message.js";

export interface MessageRepository {
  save(message: Message): Promise<Message>;
  findInbox(userId: string, params: {
    limit: number;
    offset: number;
    unread?: boolean;
    search?: string;
  }): Promise<{ messages: Message[]; total: number; unreadCount: number }>;
  findSent(userId: string, params: {
    limit: number;
    offset: number;
    search?: string;
  }): Promise<{ messages: Message[]; total: number }>;
  findById(id: string, userId: string): Promise<Message | null>;
  findThread(threadId: string, userId: string): Promise<Message[]>;
  markAsRead(id: string, userId: string): Promise<void>;
  softDelete(id: string, userId: string): Promise<void>;
  getNotificationPreference(userId: string): Promise<boolean>;
  setNotificationPreference(userId: string, enabled: boolean): Promise<void>;
}