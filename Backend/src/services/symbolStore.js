import { pool } from "../db/pool.js";
import { fetchMt5Symbols } from "./mt5Client.js";
import { logger } from "../utils/logger.js";

// Helper untuk mengekstrak kategori dari path.
// Contoh path MT5: "Stock CFD's\UAE\Abu Dhabi\ASM.AD" -> category "Stock CFD's"
function extractCategory(path) {
  if (!path) return "Unknown";
  // MT5 path menggunakan backslash atau forward slash
  const parts = path.split(/\\|\//);
  return parts[0] || "Unknown";
}

export async function syncBrokerSymbols(retries = 5, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const mt5Symbols = await fetchMt5Symbols();
      
      if (!Array.isArray(mt5Symbols)) {
        throw new Error("Invalid response from MT5 symbols list");
      }

    // Ambil jumlah simbol AKTIF saat ini di DB untuk optimasi (skip jika sama).
    // PENTING: harus filter is_active=true - broker_symbols nyimpen histori
    // simbol yang pernah delisted (is_active=false, tapi row-nya nggak
    // dihapus). Kalau COUNT(*) tanpa filter ini, begitu ada 1 simbol yang
    // pernah di-delist broker, dbCount jadi > mt5Symbols.length SELAMANYA,
    // jadi "skip kalau sama" itu nggak akan pernah kena, maksa full sync
    // terus tiap startup padahal datanya udah sama persis.
    const { rows: countRows } = await pool.query("SELECT COUNT(*) FROM broker_symbols WHERE is_active = true");
    const dbCount = parseInt(countRows[0].count);

    if (dbCount === mt5Symbols.length) {
      logger.info(`Broker symbols up-to-date (count: ${dbCount}). Skipping sync.`, { context: "System" });
      return;
    }

    logger.info(`Syncing ${mt5Symbols.length} broker symbols to DB...`, { context: "System" });

    // Pakai transaksi supaya aman jika gagal tengah jalan
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Set semua is_active = false sementara (kalau nanti ternyata dihapus broker)
      // Yang masih ada akan di-UPSERT jadi aktif lagi
      await client.query("UPDATE broker_symbols SET is_active = false");

      // Upsert batching (pakai promise all atau loop, karena kita tidak tau batas maksimum query size Postgres,
      // kita insert satu per satu atau insert values (..,..,...),..
      // Untuk 1000an simbol, loop await satu per satu mungkin butuh 1-2 detik, tapi pakai query values lebih cepat.
      // Kita pakai query values saja dengan chunk.
      
      const chunkSize = 500;
      for (let i = 0; i < mt5Symbols.length; i += chunkSize) {
        const chunk = mt5Symbols.slice(i, i + chunkSize);
        
        const params = [];
        const values = [];
        
        let paramIndex = 1;
        for (const sym of chunk) {
          const category = extractCategory(sym.path);
          // Parameter: symbol, description, path, category, trade_mode
          values.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, true, now())`);
          params.push(sym.name, sym.description || "", sym.path || "", category, sym.trade_mode ?? 0);
          paramIndex += 5;
        }

        const query = `
          INSERT INTO broker_symbols (symbol, description, path, category, trade_mode, is_active, updated_at)
          VALUES ${values.join(", ")}
          ON CONFLICT (symbol) DO UPDATE 
          SET description = EXCLUDED.description,
              path = EXCLUDED.path,
              category = EXCLUDED.category,
              trade_mode = EXCLUDED.trade_mode,
              is_active = true,
              updated_at = EXCLUDED.updated_at
        `;

        await client.query(query, params);
      }

        await client.query("COMMIT");
        logger.info("Broker symbols successfully synced to DB.", { context: "System" });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
      
      // Berhasil, keluar dari loop retry
      return;
    } catch (error) {
      if (attempt < retries) {
        logger.warn(`Failed to sync broker symbols (Attempt ${attempt}/${retries}). Retrying in ${delayMs/1000}s...`, { context: "System" });
        await new Promise(res => setTimeout(res, delayMs));
      } else {
        logger.error(`Failed to sync broker symbols after ${retries} attempts`, { error: error.message, context: "System" });
      }
    }
  }
}

export async function getSymbolsFromDb() {
  const { rows } = await pool.query(
    "SELECT symbol, description, category, path, trade_mode, is_active FROM broker_symbols ORDER BY category, symbol"
  );
  return { count: rows.length, symbols: rows };
}
