-- Migration: 001_iam_users_sessions.sql
-- Fase 0 Step 0.5: Create core tables in iam schema.
-- NEW tables (not relocated yet) — Fase 1 will migrate existing public.users
-- to iam.users via ALTER TABLE ... SET SCHEMA.

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- === USERS ===
CREATE TABLE IF NOT EXISTS iam.users (
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
CREATE INDEX IF NOT EXISTS idx_iam_users_email ON iam.users (email);
CREATE INDEX IF NOT EXISTS idx_iam_users_google_id ON iam.users (google_id);

-- === SESSIONS ===
CREATE TABLE IF NOT EXISTS iam.sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  device_fingerprint VARCHAR(255),
  ip VARCHAR(45),
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_iam_sessions_user_id ON iam.sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_iam_sessions_token ON iam.sessions (token);

-- === USER DEVICES ===
CREATE TABLE IF NOT EXISTS iam.user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  device_fingerprint VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_iam_user_devices_user_id ON iam.user_devices (user_id);

-- === EMAIL VERIFICATIONS ===
CREATE TABLE IF NOT EXISTS iam.email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  new_email VARCHAR(255),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_iam_email_verifications_user_id ON iam.email_verifications (user_id);

-- === FAILED LOGIN ATTEMPTS ===
CREATE TABLE IF NOT EXISTS iam.failed_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  ip VARCHAR(45) NOT NULL,
  attempted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_iam_failed_login_attempts_email_ip ON iam.failed_login_attempts (email, ip);
