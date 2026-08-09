export interface EmailPort {
  sendVerificationEmail(email: string, token: string): Promise<{ success: boolean; error?: string }>;
  sendEmailChangeVerification(email: string, token: string): Promise<{ success: boolean; error?: string }>;
  sendEmailChangeNotification(oldEmail: string, newEmail: string): Promise<void>;
  sendPasswordResetEmail(email: string, tempPassword: string): Promise<void>;
  sendDuplicateRegistrationNotice(email: string): Promise<void>;
  sendPasswordChangedNotification(email: string): Promise<void>;
  sendBroadcast(subject: string, body: string, recipients: Array<{ email: string; name: string }>): Promise<void>;
}

export interface AiPort {
  callModel(params: {
    model: string;
    maxTokens: number;
    system: string;
    messages: Array<{ role: "user" | "assistant" | "system"; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> };
  }): Promise<{
    text: string;
    usage?: { inputTokens: number; outputTokens: number };
  }>;
  
  streamModel(params: {
    model: string;
    maxTokens: number;
    system: string;
    messages: Array<{ role: "user" | "assistant" | "system"; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> };
    onToken: (token: string) => void;
    signal?: AbortSignal;
  }): Promise<{
    text: string;
    usage?: { inputTokens: number; outputTokens: number };
  }>;
}

export interface CachePort {
  get(taskType: string, key: string): { text: string; modelUsed: string; usage?: { inputTokens: number; outputTokens: number } } | null;
  set(taskType: string, key: string, value: { text: string; modelUsed: string; usage?: { inputTokens: number; outputTokens: number } }): void;
}

export interface EventBusPort {
  publish(event: { type: string; timestamp: Date; payload: unknown }): Promise<void>;
  subscribe(type: string, handler: (event: unknown) => Promise<void>): void;
}