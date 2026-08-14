import pg from "pg";
import { env } from "@config/env";
import { logger } from "@core/logging/logger.js";

const { Pool } = pg;

// SSL is only needed for managed/remote Postgres (e.g. Neon). Self-hosted
// Postgres (localhost, or the `postgres` Docker Compose service) doesn't
// have SSL configured, so detect that by hostname rather than NODE_ENV —
// NODE_ENV is "production" inside the container, which previously forced
// SSL on and broke local Docker Postgres connections.
const dbHost = new URL(env.DATABASE_URL).hostname;
const isLocalDb = dbHost === "localhost" || dbHost === "127.0.0.1" || dbHost === "postgres";

export const pgClient = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: true },
  max: env.DB_POOL_MAX,
  // Neon's pooler drops idle TCP connections after a few minutes.
  // Close our side first (10s) so the pool never holds a stale socket
  // that would emit an unhandled 'error' when Neon kills it.
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
  query_timeout: env.DB_QUERY_TIMEOUT_MS,
});

pgClient.on("error", (err) => {
  logger.error("Unexpected pg pool error", { context: "Database", error: err.message });
});

// Safety net: in rare race conditions, a pg Client that was just released
// back to the pool can emit 'error' before the Pool re-attaches its own
// listener. Without this, the unhandled 'error' event crashes Node.js.
// We only suppress pg-related connection errors; everything else re-throws.
process.on("uncaughtException", (err) => {
  if (
    err.message?.includes("Connection terminated unexpectedly") ||
    err.message?.includes("Connection terminated due to connection timeout") ||
    err.message?.includes("terminating connection due to administrator command")
  ) {
    logger.error("Caught pg connection error (process kept alive)", {
      context: "Database",
      error: err.message,
    });
    return; // swallow — pool will reconnect on next query
  }
  // Not a pg error — let it crash as normal
  logger.error("Uncaught exception", { error: err.message, stack: err.stack });
  process.exit(1);
});

export async function closePgClient(): Promise<void> {
  await pgClient.end();
}