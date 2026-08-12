export interface VerificationRepository {
  create(userId: string, token: string, ttlSeconds: number, newEmail?: string): Promise<void>;
  verify(token: string): Promise<{ success: boolean; userId?: string; newEmail?: string; error?: string }>;
  invalidateUserTokens(userId: string): Promise<void>;
  cleanupExpired(): Promise<number>;
}