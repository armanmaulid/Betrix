import { injectable } from "tsyringe";
import { pgClient } from "../orm/pgClient.js";
import { CreditRepository } from "@domain/repositories/CreditRepository.js";
import { CreditTransaction, CreditAction } from "@domain/entities/CreditTransaction.js";
import { logger } from "@core/logging/logger.js";
import { broadcastToUser } from "../../services/sseManager.js";

@injectable()
export class PgCreditRepository implements CreditRepository {
  async deduct(userId: string, amount: number, action: CreditAction): Promise<number> {
    const client = await pgClient.connect();
    try {
      await client.query("BEGIN");
      
      const { rows } = await client.query(
        `UPDATE users SET credits = credits - $1 WHERE id = $2 AND credits >= $1 RETURNING credits`,
        [amount, userId]
      );

      if (rows.length === 0) {
        throw new Error("Insufficient credits");
      }

      await client.query(
        `INSERT INTO credit_transactions (user_id, amount, action) VALUES ($1, $2, $3)`,
        [userId, -amount, action]
      );

      await client.query("COMMIT");
      
      const newBalance = rows[0].credits;
      broadcastToUser(userId, "credits_update", { credits: newBalance });
      
      return newBalance;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async add(userId: string, amount: number, action: CreditAction): Promise<number> {
    const client = await pgClient.connect();
    try {
      await client.query("BEGIN");
      
      const { rows } = await client.query(
        `UPDATE users SET credits = credits + $1 WHERE id = $2 RETURNING credits`,
        [amount, userId]
      );

      await client.query(
        `INSERT INTO credit_transactions (user_id, amount, action) VALUES ($1, $2, $3)`,
        [userId, amount, action]
      );

      await client.query("COMMIT");
      
      const newBalance = rows[0].credits;
      broadcastToUser(userId, "credits_update", { credits: newBalance });
      
      return newBalance;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getBalance(userId: string): Promise<number> {
    const { rows } = await pgClient.query(
      `SELECT credits FROM users WHERE id = $1`, [userId]
    );
    return rows[0]?.credits || 0;
  }

  async getTransactions(userId: string, limit: number, offset: number): Promise<{ transactions: CreditTransaction[]; total: number }> {
    const { rows: countRows } = await pgClient.query(
      `SELECT COUNT(*) FROM credit_transactions WHERE user_id = $1`, [userId]
    );
    const total = parseInt(countRows[0].count);

    const { rows } = await pgClient.query(
      `SELECT * FROM credit_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return { transactions: rows.map(this.mapRow), total };
  }

  private mapRow(row: any): CreditTransaction {
    return new CreditTransaction(
      row.id, row.user_id, row.amount, row.action as CreditAction, row.created_at
    );
  }
}