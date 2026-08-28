-- Migration: 005_admin.sql
-- Fase 0 Step 0.5: Admin module tables.

-- === ADMIN ACTIONS ===
CREATE TABLE IF NOT EXISTS admin.admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES iam.users(id),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id UUID,
  details JSONB,
  ip VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON admin.admin_actions (admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON admin.admin_actions (created_at);

-- === USER ACTIVITY LOGS ===
CREATE TABLE IF NOT EXISTS admin.user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  details JSONB,
  ip VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_user_activity_logs_user_id ON admin.user_activity_logs (user_id);
