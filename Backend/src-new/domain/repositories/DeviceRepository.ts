import { Device } from "../entities/Device.js";

export interface DeviceRepository {
  findByFingerprint(fingerprint: string): Promise<Device | null>;
  findByUserId(userId: string): Promise<Device[]>;
  findUserByFingerprint(fingerprint: string): Promise<string | null>;
  bind(device: Device): Promise<Device>;
  unbind(userId: string, fingerprint: string): Promise<void>;
  updateLastSeen(userId: string, fingerprint: string): Promise<void>;
}