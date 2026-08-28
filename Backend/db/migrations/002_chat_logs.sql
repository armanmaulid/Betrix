-- Migration: 002_chat_logs.sql
-- Fase 0 Step 0.5: Chat-related tables in chat schema.

-- === CHAT LOGS ===
CREATE TABLE IF NOT EXISTS chat.chat_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id ON chat.chat_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_session_id ON chat.chat_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_task_type ON chat.chat_logs (task_type);

-- === TOKEN USAGE (juga masuk billing-aware) ===
CREATE TABLE IF NOT EXISTS chat.token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  task_type VARCHAR(50) NOT NULL,
  model_used VARCHAR(100) NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  latency_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_token_usage_user_id ON chat.token_usage (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_token_usage_created_at ON chat.token_usage (created_at);
