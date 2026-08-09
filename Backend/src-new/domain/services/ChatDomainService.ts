import { ChatMessage, ChatTaskType, ModelTier } from "../entities/ChatMessage.js";

export interface ChatDomainService {
  sendMessage(data: {
    userId: string;
    taskType: ChatTaskType;
    message: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
    tier?: ModelTier;
    image?: string;
  }): Promise<{
    reply: string;
    modelUsed: string;
    latencyMs: number;
    usage: { inputTokens: number; outputTokens: number } | null;
  }>;
  streamMessage(data: {
    userId: string;
    taskType: ChatTaskType;
    message: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
    tier?: ModelTier;
    image?: string;
    onToken: (token: string) => void;
  }): Promise<{
    reply: string;
    modelUsed: string;
    latencyMs: number;
    usage: { inputTokens: number; outputTokens: number } | null;
  }>;
}