export interface DeviceSessionRepository {
  getSessionByDevice(userId: string, fingerprint: string): Promise<string | null>;
  setSessionForDevice(userId: string, fingerprint: string, sessionToken: string): Promise<void>;
  removeSessionForDevice(userId: string, fingerprint: string): Promise<void>;
}