import { injectable } from "tsyringe";
import { pgClient } from "../orm/pgClient.js";
import { VerificationRepository } from "@domain/repositories/VerificationRepository.js";

@injectable()
export class PgVerificationRepository implements VerificationRepository {
  async create(userId: string, token: string, ttlSeconds: number): Promise<void> {
    await pgClient.query(
      `INSERT INTO email_verifications (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 second' * $3)`,
      [userId, token, ttlSeconds]
    );
  }

  async verify(token: string): Promise<{ success: boolean; userId?: string; newEmail?: string; error?: string }> {
    const { rows } = await pgClient.query(
      `SELECT user_id, expires_at, used_at, new_email FROM email_verifications WHERE token = $1`,
      [token]
    );
    const v = rows[0];
    if (!v || v.used_at || new Date() > new Date(v.expires_at)) {
      return { success: false, error: "Token invalid, expired, or already used" };
    }
    
    await pgClient.query(
      `UPDATE email_verifications SET used_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM email_verifications WHERE token = $1)`,
      [token]
    );
    
    return { success: true, userId: v.user_id, newEmail: v.new_email };
  }

  async invalidateUserTokens(userId: string): Promise<void> {
    await pgClient.query(`UPDATE email_verifications SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  }

  async cleanupExpired(): Promise<number> {
    const { rowCount } = await pgClient.query(
      `DELETE FROM email_verifications WHERE expires_at < NOW() OR used_at IS NOT NULL`
    );
    return rowCount || 0;
  }
}