// Cache in-memory sederhana untuk General responses. Default 7 hari TTL karena
// jawaban General jarang berubah kecuali ada content update.
//
// KETERBATASAN yang perlu diketahui:
// - Cuma efektif untuk request single-turn (tanpa "history"), karena key-nya
//   cuma dari taskType + pesan terakhir.
// - Hilang tiap kali server di-restart, dan tidak "shared" kalau nanti server
//   di-deploy lebih dari satu instance (butuh Redis beneran untuk itu).

// TTL configurable via .env (dalam hari), default 7 hari
const CACHE_TTL_DAYS = parseInt(process.env.GENERAL_CACHE_TTL_DAYS) || 7;
const CACHE_TTL_MS = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

const store = new Map();

export const CACHEABLE_TASK_TYPES = ["general", "classify_signal"];

function makeKey(taskType, message) {
  return `${taskType}::${message.trim().toLowerCase()}`;
}

export function getCached(taskType, message) {
  const entry = store.get(makeKey(taskType, message));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(makeKey(taskType, message));
    return null;
  }
  return entry;
}

// Max cache entries to prevent unbounded memory growth
const MAX_CACHE_SIZE = parseInt(process.env.GENERAL_CACHE_MAX_SIZE) || 1000;

export function setCached(taskType, message, data) {
  // Evict oldest entries if cache is full
  if (store.size >= MAX_CACHE_SIZE) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) store.delete(oldestKey);
  }
  store.set(makeKey(taskType, message), {
    ...data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// FIX (memory leak): sebelumnya entry expired cuma dibersihkan secara lazy
// (saat key yang sama diakses lagi lewat getCached). Pertanyaan yang cuma
// ditanya SEKALI lalu tidak pernah ditanya lagi akan tetap nongkrong di
// Map ini selamanya walau sudah lewat expiresAt — Map terus membesar tanpa
// batas seiring waktu server hidup. Sweep berkala di bawah membuang entry
// yang sudah expired walau tidak pernah diakses ulang.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1 jam

const sweepTimer = setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) {
      store.delete(key);
      removed++;
    }
  }
  if (removed > 0 && process.env.LOG_LEVEL === "debug") {
    console.debug(`[generalCache] sweep: ${removed} entry expired dibuang, sisa ${store.size}`);
  }
}, SWEEP_INTERVAL_MS);

// unref supaya timer ini tidak mencegah proses Node exit (misal saat test
// runner atau script pendek meng-import modul ini tanpa benar-benar
// menjalankan server terus-menerus).
sweepTimer.unref?.();

// Diekspos untuk keperluan test/observability kalau dibutuhkan.
export function getCacheSize() {
  return store.size;
}
