-- Migration: 003_market.sql
-- Fase 0 Step 0.5: Market module tables.

-- === BROKER SYMBOLS ===
CREATE TABLE IF NOT EXISTS market.broker_symbols (
  symbol VARCHAR(50) PRIMARY KEY,
  description TEXT,
  path TEXT,
  category VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- === CALENDAR EVENTS ===
CREATE TABLE IF NOT EXISTS market.calendar_events (
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
CREATE INDEX IF NOT EXISTS idx_market_calendar_events_event_time ON market.calendar_events (event_time);
CREATE INDEX IF NOT EXISTS idx_market_calendar_events_country ON market.calendar_events (country);

-- === SYMBOL SYNC METADATA ===
CREATE TABLE IF NOT EXISTS market.symbol_sync_metadata (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
