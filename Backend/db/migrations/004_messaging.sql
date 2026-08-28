-- Migration: 004_messaging.sql
-- Fase 0 Step 0.5: User-to-user messaging tables.

-- === MESSAGES ===
CREATE TABLE IF NOT EXISTS messaging.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID REFERENCES iam.users(id) ON DELETE SET NULL,
  to_user_id UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  thread_id UUID NOT NULL,
  reply_to_message_id UUID REFERENCES messaging.messages(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messaging_messages_to_user_id ON messaging.messages (to_user_id);
CREATE INDEX IF NOT EXISTS idx_messaging_messages_from_user_id ON messaging.messages (from_user_id);
CREATE INDEX IF NOT EXISTS idx_messaging_messages_thread_id ON messaging.messages (thread_id);

-- === MESSAGE NOTIFICATION PREFERENCES ===
CREATE TABLE IF NOT EXISTS messaging.message_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES iam.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
