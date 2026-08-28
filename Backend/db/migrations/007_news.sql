-- Migration: 007_news.sql
-- Fase 0 Step 0.5: News module tables.

-- === NEWS ARTICLES ===
CREATE TABLE IF NOT EXISTS news.news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(255) NOT NULL,
  title TEXT NOT NULL,
  url TEXT UNIQUE NOT NULL,
  summary TEXT,
  asset_tags TEXT[],
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_news_articles_published_at ON news.news_articles (published_at);
