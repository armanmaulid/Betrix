import { pool } from "../db/pool.js";

// FIX (security regression): versi sebelumnya sempat diubah jadi lock
// murni per-email (parameter `ip` diterima tapi tidak dipakai di query) —
// itu artinya siapa pun yang tahu email korban bisa kirim 5x password
// salah dari IP MANAPUN dan mengunci akun korban 15 menit (account-lockout
// DoS), termasuk saat korban sendiri sedang login normal dari IP lain.
//
// Sekarang dipisah jadi dua lapis:
// 1. Per (email, ip) — 5x gagal dari IP yang SAMA -> IP itu saja yang kena
//    lock untuk email itu. Ini yang melindungi pemilik akun asli: gagal
//    login attacker dari IP-nya sendiri tidak mengunci akses pemilik akun
//    dari IP lain.
// 2. Global per-email dengan ambang jauh lebih tinggi (MAX_ATTEMPTS_GLOBAL)
//    — untuk menangkap brute force terdistribusi lewat banyak IP/proxy
//    yang sengaja menghindari lapis #1 (temuan review sebelumnya).
//
// Catatan jujur: lapis #2 tetap punya sisa risiko collateral lockout kalau
// penyerang benar-benar mengumpulkan puluhan IP berbeda — itu trade-off
// bawaan dari mekanisme "lock" apa pun yang murni berbasis akun. Kalau mau
// dihilangkan total, gantinya bukan lock tapi CAPTCHA/step-up verification
// setelah ambang tertentu, bukan penolakan login penuh.
const MAX_ATTEMPTS_PER_IP = 5;
const MAX_ATTEMPTS_GLOBAL = 30;
const LOCKOUT_DURATION_MINUTES = 15;

export async function recordFailedLogin(email, ip) {
  await pool.query(
    `INSERT INTO failed_login_attempts (email, ip) VALUES ($1, $2)`,
    [email, ip]
  );
}

export async function isAccountLocked(email, ip) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE ip = $2) AS per_ip_count,
       COUNT(*) AS global_count
     FROM failed_login_attempts
     WHERE email = $1
       AND attempted_at > now() - interval '1 minute' * $3`,
    [email, ip, LOCKOUT_DURATION_MINUTES]
  );

  const { per_ip_count, global_count } = rows[0];
  return (
    parseInt(per_ip_count) >= MAX_ATTEMPTS_PER_IP ||
    parseInt(global_count) >= MAX_ATTEMPTS_GLOBAL
  );
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

