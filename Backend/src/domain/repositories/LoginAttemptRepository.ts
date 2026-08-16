export interface LoginAttemptRepository {
  /** Jumlah kegagalan login untuk email ini dalam jendela waktu (menit), SEMUA IP. */
  countRecentFailures(email: string, windowMinutes: number): Promise<number>;
  recordFailedLogin(email: string, ip: string): Promise<void>;
  clearFailedLogins(email: string): Promise<void>;
  cleanupOlderThan(days: number): Promise<number>;
}