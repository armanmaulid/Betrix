export interface VerificationRepository {
  create(userId: string, token: string, ttlSeconds: number): Promise<void>;
  verify(token: string): Promise<{ success: boolean; userId?: string; error?: string }>;
  invalidateUserTokens(userId: string): Promise<void>;
}