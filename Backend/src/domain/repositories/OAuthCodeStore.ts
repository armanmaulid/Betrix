// Port penyimpanan one-time code OAuth — pengganti session token di URL
// redirect callback Google (`?code=` bukan `?token=`). Sekali pakai, TTL pendek.
// Implementasi: data/repositories/RedisOAuthCodeStore.ts
export interface OAuthCodePayload {
  sessionToken: string;
  userId: string;
}

export interface OAuthCodeStore {
  save(code: string, payload: OAuthCodePayload, ttlSeconds: number): Promise<void>;
  /** Ambil payload + langsung hapus (sekali pakai). null = tidak ada/kedaluwarsa/sudah dipakai. */
  getAndDelete(code: string): Promise<OAuthCodePayload | null>;
}
