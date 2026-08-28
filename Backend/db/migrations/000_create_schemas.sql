-- Migration: 000_create_schemas.sql
-- Fase 0 Step 0.5: Buat schema per bounded context.
-- Strategy strangler-fig: schemas dibuat DULU, tabel existing di public
-- akan di-relocate via migration berikutnya. Aplikasi tetap jalan dengan
-- tabel public sampai Fase 1 selesai migrasi repo ke schema-qualified paths.
--
-- Modules: iam, chat, market, messaging, admin, notification, billing, news

CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS chat;
CREATE SCHEMA IF NOT EXISTS market;
CREATE SCHEMA IF NOT EXISTS messaging;
CREATE SCHEMA IF NOT EXISTS admin;
CREATE SCHEMA IF NOT EXISTS notification;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS news;

COMMENT ON SCHEMA iam IS 'Identity & Access Management (auth, user, session)';
COMMENT ON SCHEMA chat IS 'AI chat (sessions, messages, streaming)';
COMMENT ON SCHEMA market IS 'Symbols, calendar, market data';
COMMENT ON SCHEMA messaging IS 'User-to-user messages, notifications prefs';
COMMENT ON SCHEMA admin IS 'Analytics, audit log, admin actions, system info';
COMMENT ON SCHEMA notification IS 'Notification primitives (SSE, email, push)';
COMMENT ON SCHEMA billing IS 'Credits, usage, transactions';
COMMENT ON SCHEMA news IS 'News articles, sources, sync';
