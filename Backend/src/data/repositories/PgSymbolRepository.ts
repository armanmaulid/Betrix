import { injectable } from "tsyringe";
import { pgClient } from "../orm/pgClient.js";
import { SymbolRepository } from "@domain/repositories/SymbolRepository.js";
import { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";

interface BrokerSymbolRow {
  symbol: string;
  description: string | null;
  path: string | null;
  category: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

@injectable()
export class PgSymbolRepository implements SymbolRepository {
  async save(symbol: BrokerSymbol): Promise<BrokerSymbol> {
    const { rows } = await pgClient.query(
      `INSERT INTO broker_symbols (symbol, description, path, category, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (symbol) DO UPDATE SET
         description = EXCLUDED.description,
         path = EXCLUDED.path,
         category = EXCLUDED.category,
         is_active = EXCLUDED.is_active,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [
        symbol.symbol, symbol.description, symbol.path, symbol.category,
        symbol.isActive, symbol.createdAt, symbol.updatedAt
      ]
    );
    return this.mapRow(rows[0]);
  }

  async saveMany(symbols: BrokerSymbol[]): Promise<number> {
    if (symbols.length === 0) return 0;
    
    const client = await pgClient.connect();
    try {
      await client.query("BEGIN");
      let count = 0;
      const chunkSize = 500;
      
      for (let i = 0; i < symbols.length; i += chunkSize) {
        const chunk = symbols.slice(i, i + chunkSize);
        const values: (string | number | boolean | Date | null)[] = [];
        const placeholders: string[] = [];
        let pIndex = 1;
        
        for (const symbol of chunk) {
          placeholders.push(`($${pIndex++},$${pIndex++},$${pIndex++},$${pIndex++},$${pIndex++},$${pIndex++},$${pIndex++})`);
          values.push(symbol.symbol, symbol.description, symbol.path, symbol.category, symbol.isActive, symbol.createdAt, symbol.updatedAt);
        }
        
        const { rowCount } = await client.query(
          `INSERT INTO broker_symbols (symbol, description, path, category, is_active, created_at, updated_at)
           VALUES ${placeholders.join(',')}
           ON CONFLICT (symbol) DO UPDATE SET
             description = EXCLUDED.description,
             path = EXCLUDED.path,
             category = EXCLUDED.category,
             is_active = EXCLUDED.is_active,
             updated_at = EXCLUDED.updated_at`,
          values
        );
        count += rowCount || 0;
      }
      await client.query("COMMIT");
      return count;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async findAll(): Promise<BrokerSymbol[]> {
    const { rows } = await pgClient.query(
      `SELECT * FROM broker_symbols ORDER BY symbol`
    );
    return rows.map(this.mapRow);
  }

  async findActive(): Promise<BrokerSymbol[]> {
    const { rows } = await pgClient.query(
      `SELECT * FROM broker_symbols WHERE is_active = TRUE ORDER BY symbol`
    );
    return rows.map(this.mapRow);
  }

  async findByCategory(category: string): Promise<BrokerSymbol[]> {
    const { rows } = await pgClient.query(
      `SELECT * FROM broker_symbols WHERE category = $1 ORDER BY symbol`, [category]
    );
    return rows.map(this.mapRow);
  }

  async findById(symbol: string): Promise<BrokerSymbol | null> {
    const { rows } = await pgClient.query(
      `SELECT * FROM broker_symbols WHERE symbol = $1`, [symbol]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async getStoredCount(): Promise<number> {
    const { rows } = await pgClient.query(
      `SELECT value FROM symbol_sync_metadata WHERE key = 'stored_count'`
    );
    return rows[0] ? parseInt(rows[0].value) : 0;
  }

  async setStoredCount(count: number): Promise<void> {
    // Store the count in a metadata table or use a simple key-value approach
    // For simplicity, we'll use a simple key-value approach in a metadata table
    await pgClient.query(
      `INSERT INTO symbol_sync_metadata (key, value, updated_at)
       VALUES ('stored_count', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [String(count)]
    );
  }

  async getLastSyncedAt(): Promise<Date | null> {
    const { rows } = await pgClient.query(
      `SELECT updated_at FROM symbol_sync_metadata WHERE key = 'last_synced_at'`
    );
    return rows[0] ? new Date(rows[0].updated_at) : null;
  }

  async setLastSyncedAt(date: Date): Promise<void> {
    await pgClient.query(
      `INSERT INTO symbol_sync_metadata (key, value, updated_at)
       VALUES ('last_synced_at', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [date.toISOString()]
    );
  }

  private mapRow(row: BrokerSymbolRow): BrokerSymbol {
    return new BrokerSymbol(
      row.symbol, row.description, row.path, row.category,
      row.is_active, row.created_at, row.updated_at
    );
  }
}