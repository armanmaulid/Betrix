import { redis } from "../db/redis.js";
import { pool } from "../db/pool.js";
import crypto from "crypto";

function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

// FIX (ketahanan): validateSession() dipanggil di SETIAP request yang butuh
// login (requireAuth), dan sebelumnya tidak punya timeout sendiri — kalau
// Upstash Redis (REST client berbasis fetch) lambat/DNS resolver bermasalah,
// request akan menggantung sampai OS-level fetch timeout habis (di insiden
// nyata terlihat konsisten ~4.3 detik per request selama outage). Timeout
// eksplisit yang lebih pendek di sini membuat kegagalan terdeteksi cepat dan
// user dapat respons error dalam hitungan detik, bukan menggantung lama di
// setiap endpoint yang butuh auth.
const SESSION_LOOKUP_TIMEOUT_MS = parseInt(process.env.SESSION_LOOKUP_TIMEOUT_MS) || 3000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout setelah ${ms}ms`)), ms)
    ),
  ]);
}

export async function createSession(userId) {
  const sessionToken = generateSessionToken();
  const expiresIn = 24 * 60 * 60;

  await redis.setex(`session:${sessionToken}`, expiresIn, userId);
  await redis.sadd(`user_sessions:${userId}`, sessionToken);
  // Ensure the set expires eventually to prevent memory leaks for inactive users
  await redis.expire(`user_sessions:${userId}`, expiresIn);

  return sessionToken;
}

export async function validateSession(sessionToken) {
  const userId = await withTimeout(
    redis.get(`session:${sessionToken}`),
    SESSION_LOOKUP_TIMEOUT_MS,
    "Redis session lookup"
  );

  if (!userId) return null;

  const { rows } = await pool.query(
    `SELECT id, email, name FROM users WHERE id = $1`,
    [userId]
  );

  return rows[0] || null;
}

export async function revokeSession(sessionToken) {
  const userId = await redis.get(`session:${sessionToken}`);
  if (userId) {
    await redis.srem(`user_sessions:${userId}`, sessionToken);
  }
  await redis.del(`session:${sessionToken}`);
}

export async function revokeAllUserSessions(userId) {
  const tokens = await redis.smembers(`user_sessions:${userId}`);

  if (tokens.length > 0) {
    const keysToDelete = tokens.map(token => `session:${token}`);
    await redis.del(...keysToDelete);
    await redis.del(`user_sessions:${userId}`);
  }

  return tokens.length;
}

export async function cleanupExpiredSessions() {
  return 0;
}
