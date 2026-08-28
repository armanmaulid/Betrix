# Betrix Backend — Dependency Stack (2026 Edition)

> Last verified: **2026-08-28** — semua versi diambil dari npm registry (https://registry.npmjs.org)

## Strategi

1. **Selalu pakai latest stable** untuk minim refactor
2. **Framework baru**: Express → Fastify 5 (TypeScript-native, 3x lebih cepat, plugin ecosystem)
3. **Persistence**: `pg` (raw) → **Drizzle ORM 0.45** + **drizzle-kit 0.31** (type-safe, multi-provider, schema-per-module)
4. **Logger**: `winston` → **Pino 10** (5x lebih cepat, JSON native, OTel-ready)
5. **Validation**: `zod 3` → **`zod 4`** (rilis stabil, jauh lebih cepat, error message lebih baik)
6. **Caching**: `@upstash/redis` tetap, plus **`ioredis 6`** untuk self-hosted Redis (dengan auto-failover)
7. **Auth**: `passport + passport-google-oauth20` → **better-auth 1.4** (TypeScript-first, OAuth built-in, ganti passport dependency)
8. **JWT**: tetap `jose` (jauh lebih aman dari `jsonwebtoken`, edge-compatible)
9. **Runtime**: target **Node 22 LTS** (long-term support sampai April 2027)
10. **Build**: tetap `tsc + tsc-alias` (sudah cukup, no need swc/esbuild)

## Tabel Versi & Alasan

| Package | Versi | Alasan Pilihan | Alasan TIDAK Pilih |
|---|---|---|---|
| `fastify` | 5.12.1 | TS-native, plugin system, OpenAPI auto-gen dari schema | Express (outdated TS types) |
| `drizzle-orm` | 0.45.2 | Multi-provider, type-safe, zero runtime overhead, schema-per-module | Prisma (heavy, generate step lambat) |
| `drizzle-kit` | 0.31.10 | Companion CLI untuk migration | Sequelize (ORM lama) |
| `zod` | 4.4.3 | Validation + OpenAPI source | Joi (no TS) |
| `pino` | 10.3.1 | JSON native, OTel instrumentation built-in | Winston (lamban) |
| `ioredis` | 6.0.0 | Robust, auto-reconnect, cluster support | node-redis (fitur lebih sedikit) |
| `pg` | 8.23.0 | Tetap dipakai di Drizzle adapter | (drizzle-orm butuh driver ini) |
| `better-auth` | 1.4.0 | TS-first, OAuth built-in, sessions, no passport boilerplate | Passport (callback-based, jadul) |
| `jose` | 6.2.10 | Edge-compatible JWT (Cloudflare/Vercel ready) | jsonwebtoken (sync-only) |
| `bcryptjs` | 3.0.3 | Pure JS, no native binding, works everywhere | bcrypt (native binding compile risk) |
| `nodemailer` | 9.0.6 | Standard de-facto | (tidak ada alternatif matang) |
| `ws` | 8.21.3 | WebSocket standard | socket.io (overkill untuk bidirectional raw) |
| `helmet` | 8.3.0 | Security headers — tetap via `@fastify/helmet` adapter | (tetap dipakai, via fastify wrapper) |
| `cors` | 2.8.6 | CORS — tetap via `@fastify/cors` | (tetap dipakai, via fastify wrapper) |
| `dotenv` | 17.4.2 | Load .env — masih standard | (tetap) |
| `tsyringe` | 4.10.0 | DI existing — tidak diganti (tim sudah familiar) | NestJS DI (overkill) |
| `reflect-metadata` | 0.2.2 | Untuk tsyringe decorator | (wajib) |
| `xss` | 1.0.15 | Sanitization HTML | DOMPurify (browser-oriented) |
| `fast-xml-parser` | 5.11.1 | MT5 WebSocket XML feed | (konten spesifik Betrix) |
| `chalk` | 6.0.0 | CLI output — tetap | (utility) |
| `ua-parser-js` | 2.0.10 | User-agent parsing | (konten spesifik Betrix) |
| `@upstash/redis` | 1.38.3 | Serverless Redis client (HTTP-based) | (sudah dipakai, edge-friendly) |

### Dev Dependencies

| Package | Versi | Alasan |
|---|---|---|
| `typescript` | 7.0.2 | TypeScript 7 (rilis 2026) — faster compile, better inference | |
| `tsx` | 4.23.12 | Dev runner — tetap (paling reliable untuk ESM) | |
| `vitest` | 4.1.11 | Test runner — tetap | |
| `@vitest/coverage-v8` | 4.1.11 | Coverage | |
| `eslint` | 10.9.1 | Linter (flat config) | |
| `typescript-eslint` | 8.68.0 | TypeScript rules | |
| `eslint-plugin-import` | 2.32.0 | Import order + boundary checking | |
| `eslint-import-resolver-typescript` | 4.4.5 | TS path resolution | |
| `dependency-cruiser` | 18.2.0 | **Enforce module boundaries** — wajib untuk hexagonal | |
| `drizzle-kit` | 0.31.10 | Migration CLI | |
| `npm-check-updates` | 19.0.0 | Cek latest versions | |
| `prettier` | 3.9.6 | Formatter | |
| `tsc-alias` | 1.9.2 | Resolve TS path alias di output | |
| `@types/*` | latest | Type definitions | |

## Yang Dihapus (vs package.json lama)

- ❌ `express` + `@types/express` + `express-rate-limit` → diganti Fastify plugin
- ❌ `passport` + `passport-google-oauth20` + `@types/passport*` → diganti **better-auth**
- ❌ `winston` + `winston-daily-rotate-file` → diganti **Pino** (pino-pretty utk dev)
- ❌ `@types/cors` → pakai type dari `@fastify/cors` (built-in)
- ❌ `tsconfig-paths` (runtime) — Drizzle tidak butuh runtime, dev sudah pakai tsx

## Yang Ditambah

- ✅ `@fastify/cors` (11.x) — CORS
- ✅ `@fastify/helmet` (13.x) — Security headers
- ✅ `@fastify/rate-limit` (11.x) — Rate limiting
- ✅ `@fastify/websocket` (11.x) — WS native untuk chat
- ✅ `@fastify/sse` (0.6.x) — Server-Sent Events native
- ✅ `@fastify/swagger` + `@fastify/swagger-ui` — Auto OpenAPI
- ✅ `drizzle-orm` + `drizzle-kit` — ORM & migration
- ✅ `pino` + `pino-pretty` — Logger
- ✅ `ioredis` — Self-hosted Redis
- ✅ `better-auth` — Modern auth (ganti passport)
- ✅ `@neondatabase/serverless` — Neon DB driver
- ✅ `@supabase/supabase-js` — Supabase driver
- ✅ `jose` — JWT modern
- ✅ `npm-check-updates` — Cek update
- ✅ `dependency-cruiser` — Module boundary enforcement
- ✅ `@opentelemetry/*` — Observability

## Cara Update Versi di Masa Depan

```bash
# Cek update yang tersedia
npm run deps:check

# Auto-update ke latest
npm run deps:update

# Verifikasi
npm run typecheck && npm test && npm run test:arch
```

## Catatan Migrasi dari Express → Fastify

Migrasi **tidak** sekaligus — pakai **strangler-fig pattern**:

1. **Branch `feat/fastify-shell`**: Buat Fastify app, mount handler Express existing via `fastify-express` adapter
2. **Per-modul migrasi**: Pindah 1 modul (mis. `iam`) ke Fastify route native + zod schema
3. **Verifikasi**: Jalankan integration test lama, pastikan response identik
4. **Repeat** untuk 6 modul lainnya
5. **Drop Express** setelah semua modul pindah

Total effort: ~1–2 hari untuk shell + 2–4 jam per modul (7 modul).

## Catatan Migrasi zod 3 → zod 4

Breaking changes yang perlu diwaspadai:

- `z.string().email()` → `z.email()` (top-level)
- `z.object({}).strict()` tetap, tapi error message format beda
- `z.infer<T>` tetap sama
- `z.coerce.*` tidak berubah

Cek changelog lengkap: https://zod.dev/v4/changelog

## Referensi

- npm registry: https://registry.npmjs.org
- Fastify LTS: https://fastify.dev/docs/latest/Reference/LTS/
- Drizzle docs: https://orm.drizzle.team/docs/latest-releases
- zod 4 migration: https://zod.dev/v4/changelog
- Pino: https://getpino.io
- better-auth: https://www.better-auth.com
