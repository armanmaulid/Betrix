import type { User } from "../entities/User.js";
import type { Session } from "../entities/Session.js";
import { Device } from "../entities/Device.js";
import type { DeviceFingerprint } from "../value-objects/index.js";

export interface AuthDomainService {
  register(data: {
    email: string;
    password: string;
    name?: string;
    deviceFingerprint?: DeviceFingerprint;
  }): Promise<{ user: User; session: Session }>;
  login(data: {
    email: string;
    password: string;
    deviceFingerprint?: DeviceFingerprint;
  }): Promise<{ user: User; session: Session }>;
  logout(sessionToken: string, deviceFingerprint?: DeviceFingerprint): Promise<void>;
  logoutAll(userId: string, exceptToken?: string): Promise<number>;
  verifyEmail(token: string): Promise<User>;
  resendVerification(email: string): Promise<void>;
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;
  changeEmail(userId: string, currentPassword: string, newEmail: string): Promise<void>;
}