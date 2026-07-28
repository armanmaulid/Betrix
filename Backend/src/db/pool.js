import pg from "pg";

const { Pool } = pg;

// FIX (OOM/DoS hardening): sebelumnya tidak ada batas waktu query sama
// sekali — satu query yang macet (misal karena beban tinggi atau lock
// contention di Postgres) bisa menahan koneksi dari pool (max 20) tanpa
// batas waktu, sehingga request lain ikut antre/timeout massal walau
// databasenya sendiri sebenarnya masih hidup.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "development" && process.env.DB_HOST === "localhost"
    ? false
    : { rejectUnauthorized: true },
  max: parseInt(process.env.DB_POOL_MAX) || 20,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS) || 5000,
  // Waktu maksimum Postgres mengeksekusi satu statement sebelum di-cancel
  // paksa oleh server DB.
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS) || 10000,
  // Waktu maksimum node-postgres menunggu hasil query di sisi client
  // sebelum melepas koneksi kembali ke pool (jaga-jaga kalau DB tidak
  // merespons cancel dengan cepat).
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS) || 15000,
});

pool.on("error", (err) => {
  console.error("[db pool] error tak terduga pada koneksi idle:", err.message);
});

