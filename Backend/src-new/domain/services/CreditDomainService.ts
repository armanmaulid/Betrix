import { CreditAction } from "../entities/CreditTransaction.js";

export interface CreditDomainService {
  deduct(userId: string, amount: number, action: CreditAction): Promise<number>;
  refund(userId: string, amount: number, action: CreditAction): Promise<number>;
  getBalance(userId: string): Promise<number>;
}