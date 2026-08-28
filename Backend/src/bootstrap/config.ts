// src/bootstrap/config.ts
// Type-safe runtime-validated application config.
//
// Env dibaca dari process.env, divalidasi dengan zod schema, dan di-export sebagai
// singleton. Jika ada env var yang required hilang atau invalid, proses crash
// dengan pesan jelas (fail-fast).
//
// CATATAN: Ini WRAPPER untuk src/config/env.ts (yang sudah ada & dipakai luas
// di codebase). Wrapper ini menambahkan:
//  1. Computed/derived config (dbProvider, dbConfig, dll)
//  2. Validasi runtime tambahan (DB_PROVIDER enum, dsb.)
//  3. Single typed export `Config` yang bisa di-inject ke seluruh app
//  4. Backward compat: `env` dari src/config/env.ts tetap di-export

import { z } from 'zod';
import { env, type Env } from '../config/env.js';

// === Derived / computed config ===

const dbProviderSchema = z.enum([
  'postgres-local',
  'neon',
  'supabase',
  'in-memory',
]);

const derivedSchema = z.object({
  DB_PROVIDER: dbProviderSchema.default('postgres-local'),
});

const derived = derivedSchema.parse({
  DB_PROVIDER: process.env.DB_PROVIDER,
});

export type DbProviderType = z.infer<typeof dbProviderSchema>;

export interface DbProviderConfigMap {
  'postgres-local': { connectionString: string };
  neon: { connectionString: string; ssl?: boolean };
  supabase: { url: string; serviceKey: string };
  'in-memory': Record<string, never>;
}

export function resolveDbConfig(
  provider: DbProviderType,
  baseEnv: Env,
): DbProviderConfigMap[DbProviderType] {
  switch (provider) {
    case 'postgres-local':
      return { connectionString: baseEnv.DATABASE_URL };
    case 'neon':
      return {
        connectionString: process.env.NEON_DATABASE_URL ?? baseEnv.DATABASE_URL,
        ssl: true,
      };
    case 'supabase':
      return {
        url: process.env.SUPABASE_URL ?? '',
        serviceKey: process.env.SUPABASE_SERVICE_KEY ?? '',
      };
    case 'in-memory':
      return {};
  }
}

export interface Config {
  env: Env;
  dbProvider: DbProviderType;
  db: DbProviderConfigMap[DbProviderType];
  isProduction: boolean;
  isTest: boolean;
  isDevelopment: boolean;
}

export const config: Config = {
  env,
  dbProvider: derived.DB_PROVIDER,
  db: resolveDbConfig(derived.DB_PROVIDER, env),
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  isDevelopment: env.NODE_ENV === 'development',
};

// Re-export `env` & `Env` untuk backward compat
export { env };
export type { Env };
