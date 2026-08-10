import "dotenv/config";
import { pgClient } from "./pgClient.js";
import { logger } from "@core/logging/logger.js";

const migrations = [
  `-- Users table
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'banned', 'suspended')),
    email_verified BOOLEAN DEFAULT FALSE,
    credits INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP WITH TIME ZONE,
    google_id VARCHAR(255) UNIQUE,
    phone VARCHAR(50),
    address TEXT,
    birthdate DATE,
    gender VARCHAR(20) CHECK (gender IN ('male', 'female', 'other')),
    bio TEXT,
    verified_at TIMESTAMP WITH TIME ZONE
  );
  CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
  CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id);`,

  `-- Sessions table
  CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    device_fingerprint VARCHAR(255),
    ip VARCHAR(45),
    user_agent TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token);`,

  `-- Chat logs table
  CREATE TABLE IF NOT EXISTS chat_logs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID,
    task_type VARCHAR(50) NOT NULL,
    model_used VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    reply TEXT NOT NULL,
    latency_ms INTEGER,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id ON chat_logs (user_id);
  CREATE INDEX IF NOT EXISTS idx_chat_logs_session_id ON chat_logs (session_id);
  CREATE INDEX IF NOT EXISTS idx_chat_logs_task_type ON chat_logs (task_type);`,

  `-- Token usage table
  CREATE TABLE IF NOT EXISTS token_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL,
    model_used VARCHAR(100) NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    latency_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_token_usage_user_id ON token_usage (user_id);
  CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON token_usage (created_at);`,

  `-- Credit transactions table
  CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions (user_id);`,

  `-- User devices table
  CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices (user_id);`,

  `-- Admin actions table
  CREATE TABLE IF NOT EXISTS admin_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id UUID,
    details JSONB,
    ip VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON admin_actions (admin_id);
  CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON admin_actions (created_at);`,

  `-- User activity logs table
  CREATE TABLE IF NOT EXISTS user_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs (user_id);`,

  `-- Messages table
  CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    thread_id UUID NOT NULL,
    reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_messages_to_user_id ON messages (to_user_id);
  CREATE INDEX IF NOT EXISTS idx_messages_from_user_id ON messages (from_user_id);
  CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages (thread_id);`,

  `-- Message notification preferences
  CREATE TABLE IF NOT EXISTS message_notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );`,

  `-- Email verifications table
  CREATE TABLE IF NOT EXISTS email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    new_email VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE
  );
  CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications (user_id);`,

  `-- Failed login attempts table
  CREATE TABLE IF NOT EXISTS failed_login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    ip VARCHAR(45) NOT NULL,
    attempted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_email_ip ON failed_login_attempts (email, ip);`,

  `-- News articles table
  CREATE TABLE IF NOT EXISTS news_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    summary TEXT,
    asset_tags TEXT[],
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_news_articles_published_at ON news_articles (published_at);`,

  `-- Broker symbols table
  CREATE TABLE IF NOT EXISTS broker_symbols (
    symbol VARCHAR(50) PRIMARY KEY,
    description TEXT,
    path TEXT,
    category VARCHAR(100),
    trade_mode INTEGER DEFAULT 3,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );`,

  `-- Calendar events table
  CREATE TABLE IF NOT EXISTS calendar_events (
    value_id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL,
    event_time TIMESTAMP WITH TIME ZONE NOT NULL,
    country VARCHAR(10) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    event_name TEXT NOT NULL,
    importance VARCHAR(20) DEFAULT 'none',
    actual TEXT,
    forecast TEXT,
    previous TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_calendar_events_event_time ON calendar_events (event_time);
  CREATE INDEX IF NOT EXISTS idx_calendar_events_country ON calendar_events (country);`,

  `-- Enable pgcrypto for UUID generation
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";`
];

async function runMigrations() {
  try {
    logger.info("Starting database migrations...", { context: "Migrate" });
    
    for (const [index, migration] of migrations.entries()) {
      logger.info(`Running migration ${index + 1}/${migrations.length}...`, { context: "Migrate" });
      await pgClient.query(migration);
    }
    
    logger.info("All migrations completed successfully!", { context: "Migrate" });
    
    // Verify tables
    const { rows } = await pgClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    logger.info("Created tables:", { context: "Migrate", tables: rows.map(r => r.table_name) });
    
  } catch (error) {
    console.error("Migration error:", error);
    logger.error("Migration failed:", { context: "Migrate", error: (error as Error).message });
    throw error;
  } finally {
    await pgClient.end();
  }
}

runMigrations().catch(() => process.exit(1));