import { redis } from "../db/redis.js";
import { logger } from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────
// Redis cache untuk data candle D1 (tickerbar).
//
// Tujuan: menyimpan hasil fetch D1 dari MT5 Bridge di Redis supaya
// banyak client yang connect tidak memicu request berulang ke MT5.
// Cache valid sampai pergantian hari BROKER (00:00 waktu broker) —
// setelah itu key expired otomatis oleh Redis (TTL), dan request
// berikutnya akan fetch ulang dari MT5 lalu simpan lagi untuk hari baru.
//
// Key format: d1cache:{SYMBOL}  (contoh: d1cache:EURUSD)
// Value: JSON string berisi array candle D1 (biasanya 2-3 candle terakhir)
// ─────────────────────────────────────────────────────────────────────────

const KEY_PREFIX = "d1cache:";

// Offset jam broker dari UTC. Default +3 (umum untuk broker EU/Cyprus).
// Configurable via env var supaya mudah disesuaikan kalau pindah broker.
const BROKER_UTC_OFFSET = Number(process.env.MT5_BROKER_UTC_OFFSET) || 3;

/**
 * Hitung sisa detik dari sekarang sampai 00:00 WAKTU BROKER besok.
 *
 * Contoh dengan BROKER_UTC_OFFSET = 3:
 *   - 00:00 broker = 21:00 UTC (hari sebelumnya)
 *   - Kalau sekarang 01:30 UTC (= 04:30 broker), sisa ≈ 19.5 jam
 *   - Kalau sekarang 20:59 UTC (= 23:59 broker), sisa ≈ 1 menit
 *   - Kalau sekarang 21:01 UTC (= 00:01 broker hari baru), sisa ≈ 24 jam
 */
export function secondsUntilBrokerMidnight() {
  const now = new Date();
  const nowUtcMs = now.getTime();

  // Hitung "sekarang dalam waktu broker" dengan menggeser offset
  const brokerNowMs = nowUtcMs + BROKER_UTC_OFFSET * 3600 * 1000;
  const brokerNow = new Date(brokerNowMs);

  // 00:00 broker BESOK (dalam "waktu broker")
  const brokerMidnight = new Date(Date.UTC(
    brokerNow.getUTCFullYear(),
    brokerNow.getUTCMonth(),
    brokerNow.getUTCDate() + 1,
    0, 0, 0
  ));

  // Konversi kembali ke UTC untuk hitung selisih
  const midnightUtcMs = brokerMidnight.getTime() - BROKER_UTC_OFFSET * 3600 * 1000;
  const diffSeconds = Math.floor((midnightUtcMs - nowUtcMs) / 1000);

  // Minimal 60 detik untuk menghindari edge case pas tepat midnight
  return Math.max(diffSeconds, 60);
}

/**
 * Ambil data D1 dari Redis cache. Return null kalau belum ada / expired.
 */
export async function getD1Cache(symbol) {
  try {
    const raw = await redis.get(`${KEY_PREFIX}${symbol}`);
    if (!raw) return null;
    // Upstash REST client bisa return object langsung (auto-deserialize)
    // atau string tergantung versi — handle kedua kasus.
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    logger.warn(`Redis GET d1cache:${symbol} gagal: ${err.message}`, {
      context: "D1Cache",
    });
    return null; // Fallback: anggap cache miss, fetch dari MT5
  }
}

/**
 * Simpan data D1 ke Redis dengan TTL sampai 00:00 waktu broker besok.
 * @param {string} symbol - Nama simbol (e.g. "EURUSD")
 * @param {Array} candles - Array candle objects mentah dari MT5
 */
export async function setD1Cache(symbol, candles) {
  try {
    const ttl = secondsUntilBrokerMidnight();
    await redis.setex(`${KEY_PREFIX}${symbol}`, ttl, JSON.stringify(candles));
    logger.debug(`D1 cache SET untuk ${symbol} (TTL ${ttl}s ≈ ${(ttl / 3600).toFixed(1)}h)`, {
      context: "D1Cache",
    });
  } catch (err) {
    // Non-fatal: kalau Redis gagal, flow tetap jalan via MT5 langsung
    logger.warn(`Redis SET d1cache:${symbol} gagal: ${err.message}`, {
      context: "D1Cache",
    });
  }
}

/**
 * Batch warmup: fetch D1 dari MT5 dan simpan ke Redis untuk daftar simbol.
 * Dipanggil saat server startup oleh warmupMarketCache().
 */
export async function warmupD1Cache(symbols, fetchFn) {
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 3); // 3 hari ke belakang (amankan weekend)

  const pad = (n) => n.toString().padStart(2, "0");
  const formatMt5Date = (d) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T00:00:00`;

  let successCount = 0;

  for (const symbol of symbols) {
    try {
      const historyData = await fetchFn(
        symbol,
        "D1",
        formatMt5Date(startDate),
        formatMt5Date(new Date(now.getTime() + 86400000))
      );

      if (historyData?.data && Array.isArray(historyData.data) && historyData.data.length > 0) {
        await setD1Cache(symbol, historyData.data);
        successCount++;
      }
    } catch (e) {
      logger.warn(`Gagal warmup D1 cache untuk ${symbol}: ${e.message}`, {
        context: "D1Cache",
      });
    }
  }

  logger.info(
    `D1 cache warmup selesai: ${successCount}/${symbols.length} simbol berhasil (broker UTC+${BROKER_UTC_OFFSET})`,
    { context: "D1Cache" }
  );
}
