import { injectable } from "tsyringe";
import { pgClient } from "../orm/pgClient.js";
import { DeviceRepository } from "@domain/repositories/DeviceRepository.js";
import { Device } from "@domain/entities/Device.js";
import { DeviceFingerprint } from "@domain/value-objects";

interface DeviceRow {
  id: string;
  user_id: string;
  device_fingerprint: string;
  created_at: Date;
  last_seen_at: Date;
}

@injectable()
export class PgDeviceRepository implements DeviceRepository {
  async findByFingerprint(fingerprint: DeviceFingerprint): Promise<Device | null> {
    const { rows } = await pgClient.query(
      `SELECT * FROM user_devices WHERE device_fingerprint = $1`, [fingerprint.value]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async findByUserId(userId: string): Promise<Device[]> {
    const { rows } = await pgClient.query(
      `SELECT * FROM user_devices WHERE user_id = $1 ORDER BY last_seen_at DESC`, [userId]
    );
    return rows.map(this.mapRow);
  }

  async findUserByFingerprint(fingerprint: DeviceFingerprint): Promise<string | null> {
    const { rows } = await pgClient.query(
      `SELECT user_id FROM user_devices WHERE device_fingerprint = $1`, [fingerprint.value]
    );
    return rows[0]?.user_id || null;
  }

  async bind(device: Device): Promise<Device> {
    const { rows } = await pgClient.query(
      `INSERT INTO user_devices (id, user_id, device_fingerprint, created_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (device_fingerprint) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         last_seen_at = EXCLUDED.last_seen_at
       RETURNING *`,
      [device.id, device.userId, device.fingerprint, device.createdAt, device.lastSeenAt]
    );
    return this.mapRow(rows[0]);
  }

  async unbind(userId: string, fingerprint: DeviceFingerprint): Promise<void> {
    await pgClient.query(
      `DELETE FROM user_devices WHERE user_id = $1 AND device_fingerprint = $2`,
      [userId, fingerprint.value]
    );
  }

  async updateLastSeen(userId: string, fingerprint: DeviceFingerprint): Promise<void> {
    await pgClient.query(
      `UPDATE user_devices SET last_seen_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND device_fingerprint = $2`,
      [userId, fingerprint.value]
    );
  }

  private mapRow(row: DeviceRow): Device {
    return new Device(
      row.id, row.user_id, row.device_fingerprint, row.created_at, row.last_seen_at
    );
  }
}