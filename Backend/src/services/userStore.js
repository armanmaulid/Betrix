import { pool } from "../db/pool.js";

export async function findByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, email, password_hash AS "passwordHash", name,
            is_admin AS "isAdmin", status, email_verified AS "emailVerified", credits
     FROM users WHERE lower(email) = lower($1)`,
    [email]
  );
  return rows[0] || null;
}

export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT id, email, name,
            is_admin AS "isAdmin", status, email_verified AS "emailVerified", credits
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function createUser({ email, passwordHash, name, emailVerified, googleId }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, email_verified, google_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, name, is_admin AS "isAdmin", status, email_verified AS "emailVerified", credits`,
    [email, passwordHash, name || "", emailVerified || false, googleId || null]
  );
  return rows[0];
}

// FIX (concurrency): dipakai saat registrasi gagal setelah user row sudah
// terlanjur dibuat — misalnya ketika dua registrasi bersamaan dari device
// (fingerprint) yang sama sama-sama lolos checkDeviceBinding() sebelum
// salah satunya sempat bind, sehingga yang kalah race tetap punya akun
// "yatim" yang lolos dari device enforcement kalau tidak dihapus. Lihat
// routes/auth.js bagian register.
export async function deleteUser(id) {
  await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
}
