import { apiClient } from "./client";

export interface Message {
  id: string;
  subject: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  threadId?: string;
  replyToMessageId?: string;
  from: {
    id: string | null;
    email: string;
    name: string;
  };
  to?: {
    id: string;
    email: string;
    name: string;
  };
}

export interface InboxResponse {
  messages: Message[];
  unreadCount: number;
  total: number;
}

export interface SentResponse {
  messages: Message[];
  total: number;
}

export interface NotificationPreferences {
  emailEnabled: boolean;
}

export const messagesApi = {
  getInbox: async (params?: { limit?: number; offset?: number; unread?: boolean; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.offset) query.set("offset", params.offset.toString());
    if (params?.unread) query.set("unread", "true");
    if (params?.search) query.set("search", params.search);
    query.set("_t", Date.now().toString()); // Cache buster

    const { data } = await apiClient.get<InboxResponse>(`/messages/inbox?${query}`);
    return data;
  },

  getSent: async (params?: { limit?: number; offset?: number; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.offset) query.set("offset", params.offset.toString());
    if (params?.search) query.set("search", params.search);

    const { data } = await apiClient.get<SentResponse>(`/messages/sent?${query}`);
    return data;
  },

  getMessage: async (id: string) => {
    const { data } = await apiClient.get<Message>(`/messages/${id}`);
    return data;
  },

  sendMessage: async (payload: { toEmail: string; subject: string; body: string; replyToMessageId?: string }) => {
    const { data } = await apiClient.post<{ id: string; createdAt: string }>("/messages/send", payload);
    return data;
  },

  getThread: async (threadId: string) => {
    const timestamp = Date.now();
    const { data } = await apiClient.get<{ messages: Message[] }>(`/messages/thread/${threadId}?_t=${timestamp}`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    return data;
  },

  markAsRead: async (id: string) => {
    try {
      const { data } = await apiClient.post<{ message: string }>(`/messages/${id}/read`);
      return data;
    } catch (err: any) {
      // Suppress 404 - message already deleted
      if (err?.response?.status === 404) {
        return { message: "Message not found" };
      }
      throw err;
    }
  },

  deleteMessage: async (id: string) => {
    const { data } = await apiClient.delete<{ message: string }>(`/messages/${id}`);
    return data;
  },

  getPreferences: async () => {
    const { data } = await apiClient.get<NotificationPreferences>("/messages/preferences/notifications");
    return data;
  },

  updatePreferences: async (payload: { emailEnabled: boolean }) => {
    const { data } = await apiClient.post<{ message: string }>("/messages/preferences/notifications", payload);
    return data;
  },
};
