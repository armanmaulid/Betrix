/**
 * Port antar-konteks (context mapping) untuk konteks `news`.
 *
 * Konteks lain (mis. admin) tidak boleh menyentuh entity/repository news
 * secara langsung — mereka hanya bergantung pada port ini.
 */
export interface NewsContextPort {
  /** Hapus artikel lebih tua dari `days` hari. Dipakai konteks admin (system cleanup). */
  cleanupOlderThan(days: number): Promise<number>;
}
