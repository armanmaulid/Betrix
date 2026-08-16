// Port penyimpanan stream ticket (sekali pakai, TTL pendek) — pengganti token
// sesi di query string URL SSE (token di URL bocor ke access log/history/Referer).
// Implementasi: data/repositories/RedisStreamTicketStore.ts
//
// Ticket menyimpan sessionToken (bukan userId) supaya saat connect, stream
// middleware tetap memvalidasi session masih hidup — logout langsung
// membatalkan ticket meski belum kedaluwarsa (tanpa index per-user).
export interface StreamTicketStore {
  save(ticket: string, sessionToken: string, ttlSeconds: number): Promise<void>;
  /** Ambil sessionToken + langsung hapus (sekali pakai). null = tidak ada/kedaluwarsa. */
  getAndDelete(ticket: string): Promise<string | null>;
}
