import type { User } from "../entities/User.js";
import type { Session } from "../entities/Session.js";
import type { ChatTaskType } from "../entities/ChatMessage.js";
import type { CreditAction } from "../entities/CreditTransaction.js";

export * from "./EventDispatcher.js";

export interface DomainEvent {
  readonly type: string;
  readonly timestamp: Date;
  readonly payload: unknown;
}

export class UserRegistered implements DomainEvent {
  readonly type = "user.registered";
  readonly timestamp = new Date();
  constructor(public readonly payload: { user: User }) {}
}

export class UserLoggedIn implements DomainEvent {
  readonly type = "user.logged_in";
  readonly timestamp = new Date();
  constructor(public readonly payload: { user: User; session: Session }) {}
}

export class UserLoggedOut implements DomainEvent {
  readonly type = "user.logged_out";
  readonly timestamp = new Date();
  constructor(public readonly payload: { userId: string; sessionId: string }) {}
}

export class EmailVerified implements DomainEvent {
  readonly type = "user.email_verified";
  readonly timestamp = new Date();
  constructor(public readonly payload: { userId: string }) {}
}

export class CreditsDeducted implements DomainEvent {
  readonly type = "credits.deducted";
  readonly timestamp = new Date();
  constructor(public readonly payload: { userId: string; amount: number; action: CreditAction; newBalance: number }) {}
}

export class CreditsRefunded implements DomainEvent {
  readonly type = "credits.refunded";
  readonly timestamp = new Date();
  constructor(public readonly payload: { userId: string; amount: number; action: CreditAction; newBalance: number }) {}
}

export class ChatCompleted implements DomainEvent {
  readonly type = "chat.completed";
  readonly timestamp = new Date();
  constructor(
    public readonly payload: {
      userId: string;
      sessionId?: string;
      taskType: ChatTaskType;
      modelUsed: string;
      message: string;
      reply: string;
      latencyMs: number;
      usage?: { inputTokens: number; outputTokens: number };
    }
  ) {}
}