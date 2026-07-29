import "dotenv/config";
import { performance } from "node:perf_hooks";
import { pool } from "./pool.js";

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS users ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT now() );`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS birthdate DATE;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;`,
  `DO $$ BEGIN IF NOT EXISTS ( SELECT 1 FROM pg_constraint WHERE conname = 'users_status_check' ) THEN ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'banned', 'suspended')); END IF; END $$;`,
  `CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);`,
  `CREATE TABLE IF NOT EXISTS chat_logs ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE SET NULL, task_type TEXT NOT NULL, model_used TEXT NOT NULL, message TEXT NOT NULL, reply TEXT NOT NULL, latency_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER, created_at TIMESTAMPTZ DEFAULT now() );`,
  `ALTER TABLE chat_logs ADD COLUMN IF NOT EXISTS session_id UUID;`,
  `CREATE INDEX IF NOT EXISTS idx_chat_logs_session_id ON chat_logs(session_id);`,
  `CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id ON chat_logs(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_chat_logs_created_at ON chat_logs(created_at);`,
  `CREATE TABLE IF NOT EXISTS admin_actions ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, action TEXT NOT NULL, target_type TEXT, target_id TEXT, details JSONB, created_at TIMESTAMPTZ DEFAULT now() );`,
  `CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON admin_actions(admin_id);`,
  `CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON admin_actions(created_at);`,
  `ALTER TABLE admin_actions ADD COLUMN IF NOT EXISTS ip TEXT;`,
  `ALTER TABLE admin_actions ADD COLUMN IF NOT EXISTS user_agent TEXT;`,
  `CREATE TABLE IF NOT EXISTS user_activity_logs ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL, details JSONB, ip TEXT, user_agent TEXT, created_at TIMESTAMPTZ DEFAULT now() );`,
  `CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_user_activity_logs_action ON user_activity_logs(action);`,
  `CREATE TABLE IF NOT EXISTS user_devices ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, device_fingerprint TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), last_seen_at TIMESTAMPTZ DEFAULT now(), UNIQUE (device_fingerprint) );`,
  `CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);`,
  `CREATE TABLE IF NOT EXISTS failed_login_attempts ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL, ip TEXT, attempted_at TIMESTAMPTZ DEFAULT now() );`,
  `CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_email_time ON failed_login_attempts(email, attempted_at);`,
  `CREATE TABLE IF NOT EXISTS email_verifications ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, token TEXT UNIQUE NOT NULL, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now() );`,
  `CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token);`,
  `ALTER TABLE email_verifications ADD COLUMN IF NOT EXISTS new_email TEXT;`,
  `CREATE TABLE IF NOT EXISTS token_usage ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE SET NULL, task_type TEXT NOT NULL, model_used TEXT NOT NULL, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, total_tokens INTEGER DEFAULT 0, latency_ms INTEGER, created_at TIMESTAMPTZ DEFAULT now() );`,
  `CREATE INDEX IF NOT EXISTS idx_token_usage_user_id ON token_usage(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON token_usage(created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_token_usage_task_type ON token_usage(task_type);`,
  `CREATE INDEX IF NOT EXISTS idx_token_usage_model_used ON token_usage(model_used);`,
  `CREATE TABLE IF NOT EXISTS messages ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), from_user_id UUID REFERENCES users(id) ON DELETE SET NULL, to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, subject TEXT NOT NULL, body TEXT NOT NULL, read_at TIMESTAMPTZ, thread_id UUID, reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL, deleted_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now() );`,
  `CREATE INDEX IF NOT EXISTS idx_messages_to_user_id ON messages(to_user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_messages_from_user_id ON messages(from_user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);`,
  `CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);`,
  `CREATE TABLE IF NOT EXISTS message_notification_preferences ( user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, email_enabled BOOLEAN NOT NULL DEFAULT true, updated_at TIMESTAMPTZ DEFAULT now() );`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;`,
  `CREATE INDEX IF NOT EXISTS idx_messages_deleted_at ON messages(deleted_at) WHERE deleted_at IS NULL;`,
  `CREATE TABLE IF NOT EXISTS news_articles ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), source TEXT NOT NULL, title TEXT NOT NULL, url TEXT UNIQUE NOT NULL, summary TEXT, asset_tags TEXT[] NOT NULL DEFAULT '{}', published_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now() );`,
  `CREATE INDEX IF NOT EXISTS idx_news_articles_published_at ON news_articles(published_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_news_articles_asset_tags ON news_articles USING GIN(asset_tags);`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;`,
  `CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);`,
  `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 100;`,
  `CREATE TABLE IF NOT EXISTS credit_transactions ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, amount INTEGER NOT NULL, action TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now() );`,
  `CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);`,
  `CREATE TABLE IF NOT EXISTS broker_symbols ( symbol TEXT PRIMARY KEY, description TEXT, path TEXT, category TEXT, trade_mode INTEGER, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now() );`,
  `CREATE INDEX IF NOT EXISTS idx_broker_symbols_category ON broker_symbols(category);`
];

const isTTY = Boolean(process.stdout.isTTY);

const paint = (code) => (text) =>
  isTTY ? `\x1b[${code}m${text}\x1b[0m` : String(text);

const green = paint("32");
const yellow = paint("33");
const red = paint("31");
const dim = paint("2");
const bold = paint("1");

function pad(text, length) {
  text = String(text ?? "");
  if (text.length > length) {
    return `${text.slice(0, length - 1)}…`;
  }
  return text.padEnd(length, " ");
}

function parseMigration(sql) {
  const one = sql.replace(/\s+/g, " ").trim();
  let m;

  if ((m = one.match(/^CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i))) {
    return { type: "table", table: m[1], name: m[1], action: "CREATE TABLE" };
  }
  if ((m = one.match(/^ALTER TABLE (\w+) ADD COLUMN (?:IF NOT EXISTS )?(\w+)/i))) {
    return { type: "column", table: m[1], name: m[2], action: "ALTER TABLE" };
  }
  if ((m = one.match(/^ALTER TABLE (\w+) ALTER COLUMN (\w+) DROP NOT NULL/i))) {
    return { type: "alter_column_drop_not_null", table: m[1], name: m[2], action: "ALTER TABLE" };
  }
  if ((m = one.match(/ALTER TABLE (\w+) ADD CONSTRAINT (\w+)/i))) {
    return { type: "constraint", table: m[1], name: m[2], action: "DO" };
  }
  if ((m = one.match(/^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?(\w+) ON (\w+)/i))) {
    return { type: "index", table: m[2], name: m[1], action: "CREATE INDEX" };
  }

  const table =
    (one.match(/\bON\s+(\w+)\s*(?:\(|\s+USING\b)/i) || [])[1] ||
    (one.match(/ALTER TABLE (\w+)/i) || [])[1] ||
    null;

  return { type: "sql", table, name: null, action: "SQL" };
}

async function getMigrationState(meta) {
  try {
    if (meta.type === "table") {
      const result = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
        [meta.table]
      );
      return result.rowCount > 0 ? "exists" : "missing";
    }
    if (meta.type === "column") {
      const result = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
        [meta.table, meta.name]
      );
      return result.rowCount > 0 ? "exists" : "missing";
    }
    if (meta.type === "index") {
      const result = await pool.query(
        `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1 AND indexname = $2`,
        [meta.table, meta.name]
      );
      return result.rowCount > 0 ? "exists" : "missing";
    }
    if (meta.type === "constraint") {
      const result = await pool.query(
        `SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace WHERE n.nspname = 'public' AND r.relname = $1 AND c.conname = $2`,
        [meta.table, meta.name]
      );
      return result.rowCount > 0 ? "exists" : "missing";
    }
    if (meta.type === "alter_column_drop_not_null") {
      const result = await pool.query(
        `SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
        [meta.table, meta.name]
      );
      if (!result.rowCount) return "missing";
      return result.rows[0].is_nullable === "YES" ? "nullable" : "not_null";
    }
  } catch {
    return "unknown";
  }
  return "unknown";
}

function deriveStatus(before, after, meta) {
  if (meta.type === "alter_column_drop_not_null") {
    if (before === "not_null" && after === "nullable") return "updated";
    if (after === "nullable") return "unchanged";
    return "unknown";
  }
  if (before === "missing" && after === "exists") return "created";
  if (before === "exists" && after === "exists") return "unchanged";
  return "unknown";
}

function statusIcon(status) {
  if (status === "created") return green("+");
  if (status === "updated") return yellow("~");
  if (status === "unchanged") return dim("=");
  if (status === "failed") return red("✗");
  return dim("?");
}

function statusText(meta, status) {
  if (status === "failed") return "gagal";
  if (meta.type === "table") return status === "created" ? `tabel ${meta.name} dibuat` : `tabel ${meta.name} sudah ada`;
  if (meta.type === "column") return status === "created" ? `kolom ${meta.name} ditambahkan` : `kolom ${meta.name} sudah ada`;
  if (meta.type === "index") return status === "created" ? `index ${meta.name} dibuat` : `index ${meta.name} sudah ada`;
  if (meta.type === "constraint") return status === "created" ? `constraint ${meta.name} dibuat` : `constraint ${meta.name} sudah ada`;
  if (meta.type === "alter_column_drop_not_null") return status === "updated" ? `kolom ${meta.name} diubah jadi nullable` : `kolom ${meta.name} sudah nullable`;
  return "eksekusi SQL";
}

function objectTypeLabel(type) {
  switch (type) {
    case "table": return "tabel";
    case "column": return "kolom";
    case "index": return "index";
    case "constraint": return "constraint";
    case "alter_column_drop_not_null": return "perubahan kolom";
    case "extension": return "extension";
    default: return "sql";
  }
}

function statusLabel(status) {
  if (status === "created") return "ditambahkan";
  if (status === "updated") return "diubah";
  if (status === "unchanged") return "sudah ada";
  if (status === "failed") return "gagal";
  return "tidak diketahui";
}

async function migrate() {
  console.log();
  console.log(bold("Menjalankan migrasi..."));
  console.log();

  const totalStart = performance.now();
  const report = [];

  const extBefore =
    (await pool.query(`SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'`)).rowCount > 0;

  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  const extAfter =
    (await pool.query(`SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'`)).rowCount > 0;

  const extStatus = !extBefore && extAfter ? "created" : "unchanged";

  console.log(
    `${statusIcon(extStatus)} ${pad("pgcrypto", 28)} ${pad("EXTENSION", 14)} ${
      extStatus === "created" ? "extension pgcrypto ditambahkan" : "extension pgcrypto sudah ada"
    }`
  );

  report.push({ tabel: "-", tipe: objectTypeLabel("extension"), objek: "pgcrypto", status: statusLabel(extStatus) });

  console.log();

  let i = 0;

  for (const sql of MIGRATIONS) {
    i++;
    const meta = parseMigration(sql);
    const before = await getMigrationState(meta);
    const start = performance.now();

    try {
      await pool.query(sql);
      const after = await getMigrationState(meta);
      const status = deriveStatus(before, after, meta);
      const durationMs = Math.round(performance.now() - start);

      console.log(
        `[${String(i).padStart(2)}/${MIGRATIONS.length}] ${statusIcon(status)} ${pad(meta.table ?? "-", 28)} ${pad(meta.action, 14)} ${statusText(meta, status)} ${dim(`(${durationMs}ms)`)}`
      );

      report.push({ tabel: meta.table ?? "-", tipe: objectTypeLabel(meta.type), objek: meta.name ?? meta.table ?? "-", status: statusLabel(status) });
    } catch (err) {
      console.error(
        `[${String(i).padStart(2)}/${MIGRATIONS.length}] ${statusIcon("failed")} ${pad(meta.table ?? "-", 28)} ${pad(meta.action, 14)} ${statusText(meta, "failed")}`
      );
      console.error();
      console.error(red("SQL yang gagal:"));
      console.error(dim(sql.replace(/\s+/g, " ").trim()));
      console.error();
      throw err;
    }
  }

  const totalSeconds = ((performance.now() - totalStart) / 1000).toFixed(2);
  const created = report.filter((r) => r.status === "ditambahkan");
  const updated = report.filter((r) => r.status === "diubah");
  const unchanged = report.filter((r) => r.status === "sudah ada");

  console.log();
  console.log(green(bold("Migrasi selesai.")));
  console.log(`Durasi: ${totalSeconds}s`);
  console.log(`Total statement: ${MIGRATIONS.length + 1}`);
  console.log(`Objek baru ditambahkan: ${created.length}`);
  console.log(`Objek diubah: ${updated.length}`);
  console.log(`Objek sudah ada: ${unchanged.length}`);

  console.log();
  console.log(bold("Objek yang benar-benar ditambahkan/diubah:"));
  const realChanges = report.filter((r) => r.status === "ditambahkan" || r.status === "diubah");
  if (realChanges.length) {
    console.table(realChanges);
  } else {
    console.log(dim("Tidak ada objek baru. Semua objek yang dibutuhkan sudah ada di database."));
  }

  console.log();
  console.log(bold("Tabel yang benar-benar baru ditambahkan:"));
  const addedTables = report.filter((r) => r.tipe === "tabel" && r.status === "ditambahkan");
  if (addedTables.length) {
    console.table(addedTables.map((r) => ({ tabel: r.tabel, status: r.status })));
  } else {
    console.log(dim("Tidak ada tabel baru yang ditambahkan."));
  }

  console.log();
  console.log(bold("Tabel yang sudah ada tapi berubah:"));
  const realCreatedTables = new Set(
    report.filter((r) => r.tipe === "tabel" && r.status === "ditambahkan").map((r) => r.tabel)
  );
  const changedTables = new Set(
    report.filter((r) => (r.status === "ditambahkan" || r.status === "diubah") && r.tabel && r.tabel !== "-").map((r) => r.tabel)
  );
  const changedExistingTables = [...changedTables].filter((table) => !realCreatedTables.has(table));
  if (changedExistingTables.length) {
    console.table(changedExistingTables.map((table) => ({ tabel: table, status: "berubah" })));
  } else {
    console.log(dim("Tidak ada tabel lama yang berubah."));
  }

  console.log();
  console.log(bold("Tabel di database:"));
  const { rows: tables } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
  );
  console.table(
    tables.map(({ table_name }) => {
      let statusTabel = "sudah ada";
      if (realCreatedTables.has(table_name)) statusTabel = "baru ditambahkan";
      else if (changedTables.has(table_name)) statusTabel = "berubah";
      return { tabel: table_name, status_tabel: statusTabel };
    })
  );

  console.log();
  console.log(bold("Kolom tabel yang disentuh migrasi ini:"));
  const touchedTables = new Set(report.map((r) => r.tabel).filter((t) => t && t !== "-"));
  if (touchedTables.size) {
    const { rows: cols } = await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1) ORDER BY table_name, ordinal_position`,
      [[...touchedTables]]
    );
    const byTable = {};
    for (const { table_name, column_name } of cols) {
      (byTable[table_name] ??= []).push(column_name);
    }
    console.table(
      Object.entries(byTable).map(([table, columns]) => {
        const columnText = columns.join(", ");
        return { tabel: table, jumlah_kolom: columns.length, kolom: columnText.length > 80 ? `${columnText.slice(0, 79)}…` : columnText };
      })
    );
  } else {
    console.log(dim("Tidak ada tabel yang disentuh."));
  }

  await pool.end();
}

migrate().catch(async (err) => {
  console.error();
  console.error(red("Migrasi gagal:"));
  console.error(err.message);
  if (err.stack) {
    console.error();
    console.error(dim(err.stack));
  }
  await pool.end().catch(() => {});
  process.exit(1);
});
