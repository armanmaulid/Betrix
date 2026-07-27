import { pool } from "../db/pool.js";

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

export async function recordFailedLogin(email, ip) {
  await pool.query(
    `INSERT INTO failed_login_attempts (email, ip) VALUES ($1, $2)`,
    [email, ip]
  );
}

export async function isAccountLocked(email, ip) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count
     FROM failed_login_attempts
     WHERE email = $1
       AND ip = $2
       AND attempted_at > now() - interval '1 minute' * $3`,
    [email, ip, LOCKOUT_DURATION_MINUTES]
  );

  return parseInt(rows[0].count) >= MAX_ATTEMPTS;
}

export async function clearFailedLogins(email) {
  await pool.query(
    `DELETE FROM failed_login_attempts WHERE email = $1`,
    [email]
  );
}

export async function cleanupOldFailedAttempts() {
  const { rowCount } = await pool.query(
    `DELETE FROM failed_login_attempts
     WHERE attempted_at <= now() - interval '1 minute' * $1`,
    [LOCKOUT_DURATION_MINUTES]
  );
  return rowCount;
}

