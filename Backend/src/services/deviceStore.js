import { pool } from "../db/pool.js";

export async function checkDeviceBinding(deviceFingerprint) {
  const { rows } = await pool.query(
    `SELECT user_id FROM user_devices WHERE device_fingerprint = $1`,
    [deviceFingerprint]
  );
  return rows[0]?.user_id || null;
}

export async function bindDeviceToUser(userId, deviceFingerprint) {
  await pool.query(
    `INSERT INTO user_devices (user_id, device_fingerprint)
     VALUES ($1, $2)
     ON CONFLICT (device_fingerprint)
     DO UPDATE SET last_seen_at = now()`,
    [userId, deviceFingerprint]
  );
}

export async function updateDeviceLastSeen(deviceFingerprint) {
  await pool.query(
    `UPDATE user_devices SET last_seen_at = now() WHERE device_fingerprint = $1`,
    [deviceFingerprint]
  );
}
