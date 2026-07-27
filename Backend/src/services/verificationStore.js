import { pool } from "../db/pool.js";
import crypto from "crypto";

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function createVerificationToken(userId) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO email_verifications (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, token, expiresAt]
  );

  return token;
}

export async function verifyToken(token) {
  const { rows } = await pool.query(
    `SELECT user_id, expires_at, used_at
     FROM email_verifications
     WHERE token = $1`,
    [token]
  );

  if (rows.length === 0) {
    return { success: false, error: "Invalid verification token" };
  }

  const verification = rows[0];

  if (verification.used_at) {
    return { success: false, error: "Verification token already used" };
  }

  if (new Date() > new Date(verification.expires_at)) {
    return { success: false, error: "Verification token expired" };
  }

  await pool.query(
    `UPDATE email_verifications
     SET used_at = CURRENT_TIMESTAMP
     WHERE token = $1`,
    [token]
  );

  await pool.query(
    `UPDATE users
     SET email_verified = TRUE, verified_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [verification.user_id]
  );

  return { success: true, userId: verification.user_id };
}

export async function isUserVerified(userId) {
  const { rows } = await pool.query(
    `SELECT email_verified FROM users WHERE id = $1`,
    [userId]
  );

  return rows.length > 0 && rows[0].email_verified;
}

export async function invalidateUserTokens(userId) {
  await pool.query(
    `UPDATE email_verifications
     SET used_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );
}

export async function cleanupExpiredTokens() {
  const { rowCount } = await pool.query(
    `DELETE FROM email_verifications
     WHERE expires_at < CURRENT_TIMESTAMP AND used_at IS NULL`
  );

  return rowCount;
}
