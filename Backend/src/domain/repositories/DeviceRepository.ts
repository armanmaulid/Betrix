import type { Device } from "../entities/Device.js";
import type { DeviceFingerprint } from "../value-objects";

export interface DeviceRepository {
  findByFingerprint(fingerprint: DeviceFingerprint): Promise<Device | null>;
  findByUserId(userId: string): Promise<Device[]>;
  findUserByFingerprint(fingerprint: DeviceFingerprint): Promise<string | null>;
  /** Bind device — null kalau fingerprint sudah terikat akun LAIN (konflik, tidak reassign). */
  bind(device: Device): Promise<Device | null>;
  unbind(userId: string, fingerprint: DeviceFingerprint): Promise<void>;
  updateLastSeen(userId: string, fingerprint: DeviceFingerprint): Promise<void>;
}