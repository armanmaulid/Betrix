export class Message {
  constructor(
    public readonly id: string,
    public readonly fromUserId: string | null,
    public readonly toUserId: string,
    public readonly subject: string,
    public readonly body: string,
    public readonly readAt: Date | null,
    public readonly threadId: string,
    public readonly replyToMessageId: string | null,
    public readonly deletedAt: Date | null,
    public readonly createdAt: Date
  ) {}

  static create(data: {
    fromUserId: string | null;
    toUserId: string;
    subject: string;
    body: string;
    replyToMessageId?: string | null;
    threadId?: string;
  }): Message {
    return new Message(
      crypto.randomUUID(),
      data.fromUserId,
      data.toUserId,
      data.subject,
      data.body,
      null,
      data.threadId || crypto.randomUUID(),
      data.replyToMessageId ?? null,
      null,
      new Date()
    );
  }

  isRead(): boolean {
    return this.readAt !== null;
  }

  isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  isFromSystem(): boolean {
    return this.fromUserId === null;
  }
}