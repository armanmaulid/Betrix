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
    `SELECT id, email, name, phone, address, birthdate, gender, bio,
            is_admin AS "isAdmin", status, email_verified AS "emailVerified", credits,
            created_at AS "createdAt", last_active AS "lastActive"
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function updateUserProfile(id, { name, phone, address, birthdate, gender, bio }) {
  const { rows } = await pool.query(
    `UPDATE users 
     SET name = $1, phone = $2, address = $3, birthdate = $4, gender = $5, bio = $6
     WHERE id = $7
     RETURNING id, email, name, phone, address, birthdate, gender, bio,
               is_admin AS "isAdmin", status, email_verified AS "emailVerified", credits,
               created_at AS "createdAt", last_active AS "lastActive"`,
    [name, phone || null, address || null, birthdate || null, gender || null, bio || null, id]
  );
  return rows[0];
}

export async function findPasswordHashById(id) {
  const { rows } = await pool.query(
    `SELECT password_hash FROM users WHERE id = $1`,
    [id]
  );
  return rows[0]?.password_hash || null;
}

export async function updateUserPassword(id, passwordHash) {
  await pool.query(
    `UPDATE users SET password_hash = $1 WHERE id = $2`,
    [passwordHash, id]
  );
}

export async function updateUserEmail(id, newEmail) {
  await pool.query(
    `UPDATE users SET email = $1 WHERE id = $2`,
    [newEmail, id]
  );
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
