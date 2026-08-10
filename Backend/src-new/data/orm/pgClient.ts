import pg from "pg";
import { env } from "@config/env";
import { logger } from "@core/logging/logger.js";

const { Pool } = pg;

export const pgClient = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === "development" && env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: true },
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
  query_timeout: env.DB_QUERY_TIMEOUT_MS,
});

pgClient.on("error", (err) => {
  logger.error("Unexpected pg pool error", { context: "Database", error: err.message });
});

export async function closePgClient(): Promise<void> {
  await pgClient.end();
}