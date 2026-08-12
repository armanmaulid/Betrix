export enum CreditAction {
  CHAT_CHEAP = "chat_cheap",
  CHAT_BALANCED = "chat_balanced",
  CHAT_DEEP = "chat_deep",
  REFUND_CHAT_CHEAP = "refund_chat_cheap",
  REFUND_CHAT_BALANCED = "refund_chat_balanced",
  REFUND_CHAT_DEEP = "refund_chat_deep",
  ADMIN_GRANT = "admin_grant",
  ADMIN_DEDUCT = "admin_deduct",
  REGISTRATION_BONUS = "registration_bonus",
}

export class CreditTransaction {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly amount: number,
    public readonly action: CreditAction,
    public readonly createdAt: Date
  ) {}

  isCredit(): boolean {
    return this.amount > 0;
  }

  isDebit(): boolean {
    return this.amount < 0;
  }
}