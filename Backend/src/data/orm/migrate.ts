// src/data/orm/migrate.ts
//
// Migration runner — apply SQL files from db/migrations/ in alphabetical order.
// Idempotent: all migrations use CREATE TABLE/INDEX IF NOT EXISTS.
//
// Strategy strangler-fig:
//  - Fase 0: schemas + tables baru di schemas (parallel dengan public tables lama)
//  - Fase 1: migrasi repo ke schema-qualified paths, pindahkan data
//  - Fase 2+: hapus public tables setelah semua repo migrasi

import "dotenv/config";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pgClient } from "./pgClient.js";
import { logger } from "@infrastructure/observability/logger.js";

const log = logger.child({ module: "infrastructure", component: "migrate" });

const MIGRATIONS_DIR = resolve(process.cwd(), "db", "migrations");

async function runSqlFile(filepath: string): Promise<void> {
  const sql = readFileSync(filepath, "utf-8");
  const filename = filepath.split("/").pop() ?? filepath;
  log.info(`Running migration: ${filename}`);
  await pgClient.query(sql);
}

async function runMigrations(): Promise<void> {
  try {
    log.info("Starting database migrations...");

    if (!existsSync(MIGRATIONS_DIR)) {
      log.warn(`Migrations dir not found: ${MIGRATIONS_DIR} — skipping`);
      return;
    }

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      log.warn("No migration files found");
      return;
    }

    for (const file of files) {
      await runSqlFile(join(MIGRATIONS_DIR, file));
    }

    log.info(`All ${files.length} migrations completed successfully!`);

    // Verify tables
    const { rows } = await pgClient.query<{ table_schema: string; table_name: string }>(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);

    const bySchema = rows.reduce<Record<string, string[]>>((acc, r) => {
      (acc[r.table_schema] ??= []).push(r.table_name);
      return acc;
    }, {});

    log.info("Tables by schema", { schemas: bySchema });
  } catch (error) {
    log.error("Migration failed", { error: (error as Error).message });
    throw error;
  } finally {
    await pgClient.end();
  }
}

runMigrations().catch(() => process.exit(1));
