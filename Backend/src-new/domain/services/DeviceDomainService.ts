import type { Device } from "../entities/Device.js";
import type { DeviceFingerprint } from "../value-objects/index.js";

export interface DeviceDomainService {
  checkBinding(fingerprint: DeviceFingerprint): Promise<string | null>;
  bindDevice(userId: string, fingerprint: DeviceFingerprint): Promise<Device>;
  unbindDevice(userId: string, fingerprint: DeviceFingerprint): Promise<void>;
  getUserDevices(userId: string): Promise<Device[]>;
}