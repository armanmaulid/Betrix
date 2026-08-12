import { injectable } from "tsyringe";
import { pgClient } from "../orm/pgClient.js";
import { LoginAttemptRepository } from "@domain/repositories/LoginAttemptRepository.js";

@injectable()
export class PgLoginAttemptRepository implements LoginAttemptRepository {
  async isAccountLocked(email: string, ip: string): Promise<boolean> {
    const { rows } = await pgClient.query(
      `SELECT COUNT(*) as count FROM failed_login_attempts 
       WHERE email = $1 AND ip = $2 AND attempted_at > NOW() - INTERVAL '15 minutes'`,
      [email, ip]
    );
    return parseInt(rows[0].count) >= 10;
  }

  async recordFailedLogin(email: string, ip: string): Promise<void> {
    await pgClient.query(
      `INSERT INTO failed_login_attempts (email, ip) VALUES ($1, $2)`,
      [email, ip]
    );
  }

  async clearFailedLogins(email: string): Promise<void> {
    await pgClient.query(
      `DELETE FROM failed_login_attempts WHERE email = $1`,
      [email]
    );
  }

  async cleanupOlderThan(days: number): Promise<number> {
    const { rowCount } = await pgClient.query(
      `DELETE FROM failed_login_attempts WHERE attempted_at < NOW() - INTERVAL '1 day' * $1`,
      [days]
    );
    return rowCount || 0;
  }
}