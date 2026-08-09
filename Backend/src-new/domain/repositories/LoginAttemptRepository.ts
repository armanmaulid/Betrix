export interface LoginAttemptRepository {
  isAccountLocked(email: string, ip: string): Promise<boolean>;
  recordFailedLogin(email: string, ip: string): Promise<void>;
  clearFailedLogins(email: string): Promise<void>;
}