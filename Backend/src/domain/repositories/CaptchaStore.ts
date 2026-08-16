// Port penyimpanan challenge CAPTCHA (in-app, sekali pakai, TTL pendek).
// Implementasi: data/repositories/RedisCaptchaStore.ts
export interface CaptchaStore {
  save(challengeId: string, answerHash: string, ttlSeconds: number): Promise<void>;
  /** Ambil jawaban + langsung hapus (sekali pakai). null = tidak ada/kedaluwarsa. */
  getAndDelete(challengeId: string): Promise<string | null>;
}
