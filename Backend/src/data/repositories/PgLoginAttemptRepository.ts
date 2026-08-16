import { injectable } from "tsyringe";
import { pgClient } from "../orm/pgClient.js";
import { LoginAttemptRepository } from "@domain/repositories/LoginAttemptRepository.js";

@injectable()
export class PgLoginAttemptRepository implements LoginAttemptRepository {
  async countRecentFailures(email: string, windowMinutes: number): Promise<number> {
    const { rows } = await pgClient.query(
      `SELECT COUNT(*) as count FROM failed_login_attempts 
       WHERE email = $1 AND attempted_at > NOW() - make_interval(mins => $2)`,
      [email, windowMinutes]
    );
    return parseInt(rows[0].count);
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