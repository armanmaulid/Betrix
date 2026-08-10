import { Device } from "../entities/Device.js";
import { DeviceFingerprint } from "../value-objects";

export interface DeviceRepository {
  findByFingerprint(fingerprint: DeviceFingerprint): Promise<Device | null>;
  findByUserId(userId: string): Promise<Device[]>;
  findUserByFingerprint(fingerprint: DeviceFingerprint): Promise<string | null>;
  bind(device: Device): Promise<Device>;
  unbind(userId: string, fingerprint: DeviceFingerprint): Promise<void>;
  updateLastSeen(userId: string, fingerprint: DeviceFingerprint): Promise<void>;
}