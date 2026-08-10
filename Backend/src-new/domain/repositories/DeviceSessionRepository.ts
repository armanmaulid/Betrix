export interface DeviceSessionRepository {
  getSessionByDevice(userId: string, fingerprint: string): Promise<string | null>;
  setSessionForDevice(userId: string, fingerprint: string, sessionToken: string): Promise<void>;
  removeSessionForDevice(userId: string, fingerprint: string): Promise<void>;
  setSessionForDeviceAtomic(userId: string, fingerprint: string, sessionToken: string): Promise<{ success: boolean; oldToken?: string }>;
  replaceSessionForDevice(userId: string, fingerprint: string, sessionToken: string): Promise<string | null>;
}