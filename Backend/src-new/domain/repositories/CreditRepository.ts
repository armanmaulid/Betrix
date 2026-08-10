import type { CreditTransaction, CreditAction } from "../entities/CreditTransaction.js";

export interface CreditRepository {
  deduct(userId: string, amount: number, action: CreditAction): Promise<number>;
  add(userId: string, amount: number, action: CreditAction): Promise<number>;
  getBalance(userId: string): Promise<number>;
  getTransactions(userId: string, limit: number, offset: number): Promise<{ transactions: CreditTransaction[]; total: number }>;
}