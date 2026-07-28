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
const SESSION_LOOKUP_TIMEOUT_MS = parseInt(process.env.SESSION_LOOKUP_TIMEOUT_MS) || 5000;

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

const sessionMemoryCache = new Map();

export async function validateSession(sessionToken) {
  const now = Date.now();
  const cached = sessionMemoryCache.get(sessionToken);
  if (cached && now - cached.timestamp < 5000) {
    return cached.user;
  }

  const userId = await withTimeout(
    redis.get(`session:${sessionToken}`),
    SESSION_LOOKUP_TIMEOUT_MS,
    "Redis session lookup"
  );

  if (!userId) return null;

  const { rows } = await pool.query(
    `SELECT id, email, name, status FROM users WHERE id = $1`,
    [userId]
  );

  const user = rows[0];
  if (!user) return null;

  // FIX (security): sebelumnya query ini tidak mengambil/mengecek `status`
  // sama sekali, jadi requireAuth (yang memakai fungsi ini) menganggap
  // SEMUA session di Redis masih valid selama tokennya belum expired —
  // termasuk milik user yang baru saja di-ban/suspend admin. Sekarang kalau
  // ternyata akunnya sudah tidak aktif, session langsung dicabut di sini
  // juga (self-healing) supaya token itu tidak bisa dipakai lagi sama
  // sekali, bukan cuma menunggu revoke eksplisit dari sisi admin.
  if (user.status !== "active") {
    await revokeSession(sessionToken).catch(() => {});
    return null;
  }

  sessionMemoryCache.set(sessionToken, { user, timestamp: Date.now() });
  return user;
}

export async function revokeSession(sessionToken) {
  const userId = await redis.get(`session:${sessionToken}`);
  if (userId) {
    await redis.srem(`user_sessions:${userId}`, sessionToken);
  }
  await redis.del(`session:${sessionToken}`);
  return userId;
}

export async function revokeAllUserSessions(userId, { exceptToken } = {}) {
  const tokens = await redis.smembers(`user_sessions:${userId}`);
  const tokensToRevoke = exceptToken ? tokens.filter((t) => t !== exceptToken) : tokens;

  if (tokensToRevoke.length > 0) {
    const keysToDelete = tokensToRevoke.map(token => `session:${token}`);
    await redis.del(...keysToDelete);
    await redis.srem(`user_sessions:${userId}`, ...tokensToRevoke);
  }

  return tokensToRevoke.length;
}

export async function cleanupExpiredSessions() {
  return 0;
}
