// vitest.setup.ts
// Global setup untuk vitest — set env vars dummy sebelum test jalan.
// Banyak file di-import via module init (logger.ts, config/env.ts) yang
// trigger envSchema.parse() — jadi kita butuh env tersedia SEBELUM import.

process.env.NODE_ENV = "test";
process.env.PORT = "3001";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.UPSTASH_REDIS_REST_URL = "https://test.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
process.env.JWT_SECRET = "test-jwt-secret-must-be-at-least-32-chars-long";
process.env.AI_BASE_URL = "https://api.test.com";
process.env.AI_API_KEY = "test-ai-key";
process.env.MODEL_CHEAP = "test-model-cheap";
process.env.MODEL_BALANCED = "test-model-balanced";
process.env.MODEL_DEEP = "test-model-deep";
process.env.SMTP_USER = "test@test.com";
process.env.SMTP_PASS = "test-pass";
