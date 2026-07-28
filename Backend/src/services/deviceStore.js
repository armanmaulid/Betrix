import { pool } from "../db/pool.js";

export async function checkDeviceBinding(deviceFingerprint) {
  const { rows } = await pool.query(
    `SELECT user_id FROM user_devices WHERE device_fingerprint = $1`,
    [deviceFingerprint]
  );
  return rows[0]?.user_id || null;
}

export async function bindDeviceToUser(userId, deviceFingerprint) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT user_id FROM user_devices WHERE device_fingerprint = $1 FOR UPDATE`,
      [deviceFingerprint]
    );
    if (rows.length > 0) {
      if (rows[0].user_id !== userId) {
        throw new Error("Device_Bound_To_Other");
      }
      await client.query(
        `UPDATE user_devices SET last_seen_at = now() WHERE device_fingerprint = $1`,
        [deviceFingerprint]
      );
    } else {
      await client.query(
        `INSERT INTO user_devices (user_id, device_fingerprint) VALUES ($1, $2)`,
        [userId, deviceFingerprint]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") { // unique_violation
      throw new Error("Device_Bound_To_Other");
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function updateDeviceLastSeen(deviceFingerprint) {
  await pool.query(
    `UPDATE user_devices SET last_seen_at = now() WHERE device_fingerprint = $1`,
    [deviceFingerprint]
  );
}

export async function getUserDevices(userId) {
  const { rows } = await pool.query(
    `SELECT device_fingerprint AS "fingerprint", last_seen_at AS "lastSeenAt" 
     FROM user_devices 
     WHERE user_id = $1 
     ORDER BY last_seen_at DESC`,
    [userId]
  );
  return rows;
}

export async function unbindDevice(userId, deviceFingerprint) {
  await pool.query(
    `DELETE FROM user_devices WHERE user_id = $1 AND device_fingerprint = $2`,
    [userId, deviceFingerprint]
  );
}
