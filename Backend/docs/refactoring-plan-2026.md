# Backend Refactoring Plan — Betrix (2026)

> Target: Evolusi dari **layered monolith** saat ini menuju **Modular Monolith** yang siap di-ekstrak jadi microservices selektif bila ada bukti kebutuhan. Disusun mengikuti rekomendasi industri 2026 (Sam Newman, Shopify, Spring Modulith, WunderGraph, segment.com).

---

## 0. Audit Singkat Kondisi Saat Ini

Stack & struktur existing di `Backend/`:

| Aspek | Kondisi Sekarang | Catatan |
|---|---|---|
| Runtime | Node.js + Express 4 + TypeScript | Single process, single deploy |
| Container | Docker + docker-compose (Postgres + Redis + SRH) | Sudah OK |
| DI | `tsyringe` + `reflect-metadata` | Sudah ada, bagus |
| Validasi | `zod` | Bagus |
| Logger | `winston` + daily-rotate | Bagus |
| Auth | JWT + Google OAuth + device session | Sudah mature |
| Realtime | WS (chat) + SSE (notifier) | Sudah dipisah ke `infrastructure/sse` |
| Struktur | `core / domain / application / infrastructure / presentation` | Sudah mirip Clean Architecture |
| Modul | `use-cases/{auth,chat,admin,market,user}` + `contexts/news` | Belum konsisten — sebagian pakai use-case, sebagian konteks |
| Test | `vitest` (parsial, hanya sebagian use-case) | Coverage rendah |
| Lint | `eslint` + `typescript-eslint` | Ada |
| CI | Belum ada `.github/workflows` terlihat | Perlu ditambah |

**Pain points yang teridentifikasi (khas "big ball of mud" ringan):**

1. **Inkonsistensi pola** — `use-cases/*` (style vertical-slice) bercampur dengan `contexts/news/{domain,application,infrastructure}` (style DDD bounded context). Tidak ada satu konvensi.
2. **Tidak ada module boundary enforcement** — siapa pun bisa `import` dari mana saja, ESLint tidak membatasi.
3. **Database bersama tanpa schema isolation** — semua repository pakai DB & tabel dalam 1 schema. Kalau nanti pisah service, refactor data akan mahal.
4. **Tidak ada outbox / event bus** — komunikasi antar domain (mis. `news → user notification`, `auth → audit log`) kemungkinan via direct call.
5. **Tidak ada API contract versioning** — belum terlihat OpenAPI/Proto.
6. **Test & observability minim** — test hanya di sebagian use-case, tidak ada tracing.
7. **SSE & WS** tercampur aduk dengan HTTP biasa di presentation.

---

## 1. Prinsip Arsitektur Target (2026 Best Practice)

Berdasarkan riset 2026 (Microservices vs Modular Monolith, Software Architecture Patterns Guide 2026, Hexamodulith, NestJS Nx Modular Monolith):

1. **Modular Monolith dulu, microservices nanti** — untuk tim < 50 engineer, modular monolith = default, BUKAN langkah antara.
2. **Bounded Contexts (DDD)** sebagai unit organisasi kode, bukan technical layers.
3. **Strict module boundaries** — enforced by tooling (ESLint `no-restricted-imports` + dependency-cruiser + arch test), bukan hanya konvensi.
4. **One public API per module** — modul hanya expose via `index.ts` (barrel) + interface; internal tidak boleh di-import langsung.
5. **Database schema per modul** (schema-per-bounded-context) walau masih 1 DB — agar esktraksi service nanti murah.
6. **In-process event bus** (pubsub) untuk komunikasi async lintas modul — bisa di-swap ke Kafka/NATS tanpa ubah domain.
7. **API Gateway + BFF** (opsional fase 3) untuk decoupling client dari bentuk internal.
8. **Observability by default**: structured log, OpenTelemetry trace, health/readiness probe.
9. **Strangler Fig Pattern** untuk migrasi komponen lama — bungkus legacy dengan adapter, lalu pelan-pelan ganti.

---

## 2. Target Struktur Direktori

```
Backend/
├── src/
│   ├── main.ts                        # bootstrap Express + module registry
│   ├── bootstrap/                     # app composition root
│   │
│   ├── shared/                        # cross-cutting utilities (NO business logic)
│   │   ├── kernel/                    # Logger, EventBus, Clock, IdGen interfaces
│   │   ├── errors/                    # AppError, DomainError, infra errors
│   │   ├── di/                        # tsyringe container tokens & helpers
│   │   ├── http/                      # response envelope, pagination, problem+json
│   │   ├── validation/                # zod helpers, common schemas
│   │   └── auth/                      # jwt verify, guards (framework-agnostic)
│   │
│   ├── modules/                       # === BOUNDED CONTEXTS (inti baru) ===
│   │   ├── iam/                       # Identity & Access Management (auth + user + sessions)
│   │   │   ├── domain/                # entities, value-objects, events, ports
│   │   │   ├── application/           # use-cases, services, dto
│   │   │   ├── infrastructure/        # repos (pg), bcrypt, jwt, oauth adapters
│   │   │   ├── presentation/          # http controllers, routes, middlewares
│   │   │   ├── events/                # event handlers (subscribers)
│   │   │   ├── ioc/                   # tsyringe registration
│   │   │   ├── iam.module.ts          # public API (barrel export)
│   │   │   └── tests/                 # unit + integration
│   │   │
│   │   ├── market/                    # symbols, calendar, market data
│   │   ├── trading/                   # trade analysis, signals (kalau ada)
│   │   ├── chat/                      # AI chat, sessions, history
│   │   ├── news/                      # news feed (existing contexts/news)
│   │   ├── messaging/                 # user-to-user messages
│   │   ├── admin/                     # analytics, audit, broadcast, system info
│   │   ├── billing/                   # credit, usage (kalau sudah ada)
│   │   └── notification/              # email, SSE, push (infra-only)
│   │
│   ├── infrastructure/                # cross-module infra adapters
│   │   ├── persistence/               # pg pool, migrator, unit-of-work
│   │   ├── cache/                     # redis/upstash adapter
│   │   ├── messaging/                 # in-process EventBus impl + (future) outbox
│   │   ├── realtime/                  # ws hub, sse notifier
│   │   ├── email/                     # nodemailer adapter
│   │   ├── captcha/                   # captcha verification
│   │   └── observability/             # otel, metrics, health
│   │
│   ├── interfaces/                    # === EDGE / DELIVERY LAYER ===
│   │   ├── http/                      # express app, route registry, middlewares
│   │   ├── ws/                        # websocket gateway
│   │   └── sse/                       # sse gateway
│   │
│   └── legacy/                        # Strangler Fig shim (kosong di target akhir)
│
├── db/
│   └── migrations/                    # one folder, prefixed by module: iam_*, market_*
│
├── tools/
│   ├── dependency-cruiser.config.cjs  # enforce module boundaries
│   ├── arch-test/                     # vitest-based architecture tests
│   └── openapi/                       # contract definitions
│
├── .github/workflows/
│   ├── ci.yml                         # lint + test + arch-test
│   └── release.yml
│
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── eslint.config.js
├── dependency-cruiser.config.cjs
└── README.md
```

### Mapping dari struktur lama → baru

| Lama | Baru |
|---|---|
| `domain/{entities,repositories,events,value-objects,ports,services}` (campur semua domain) | Tetap di masing-masing `modules/<context>/domain/` |
| `application/services/*` (campur) | Pisah → `modules/<context>/application/` |
| `application/use-cases/{auth,chat,admin,market,user}` | → `modules/{iam,chat,admin,market,messaging}/application/use-cases/` |
| `contexts/news/{application,domain,infrastructure}` | → `modules/news/` (dengan tambahan `presentation/`, `events/`, `ioc/`) |
| `infrastructure/sse/SseNotifier.ts` | → `infrastructure/realtime/sse/` + `modules/notification/` |
| `presentation/{controllers,routes,middleware}` (campur) | → `modules/<context>/presentation/` + `interfaces/http/` |
| `core/{constants,errors,logging,middleware,settings,utils}` | → `shared/{kernel,errors,validation}/` + `infrastructure/observability/` + `interfaces/http/middleware/` |

---

## 3. Tahapan Refaktor (Roadmap 12–16 minggu)

### Fase 0 — Fondasi (Minggu 1–2)
**Tujuan:** pagar pembatas & tooling agar refactor aman.

- [ ] Tambah **dependency-cruiser** + aturan "no cross-module internal imports"
  - `forbidden: src/modules/*/!(index|*.module).ts ← src/modules/*/*`
- [ ] Tambah **arch-test** (vitest) yang assert:
  - `modules/iam/**` tidak import dari `modules/market/**`
  - `domain/**` tidak import dari `infrastructure/**` atau `presentation/**`
  - `infrastructure/**` tidak import dari `presentation/**`
- [ ] Tambah CI workflow `.github/workflows/ci.yml`:
  - `lint`, `typecheck`, `test`, `arch-test`, `build`
- [ ] Tambah **per-module schema** di Postgres:
  ```sql
  CREATE SCHEMA iam; CREATE SCHEMA market; CREATE SCHEMA chat; ...
  ```
  Biarkan tabel lama sebentar, lalu migrasi bertahap.
- [ ] Tambah **OpenTelemetry SDK** (instrumentation express, pg, http).
- [ ] Standarkan **Result type** & error envelope (`{ ok, data, error }`).

**Deliverable:** PR#1 hijau di CI, arch-test fail jika ada import silang. Tidak ada perubahan runtime.

### Fase 1 — Konsolidasi ke Bounded Contexts (Minggu 3–6)
**Tujuan:** satu konvensi, semua modul pakai pola yang sama.

- [ ] Pilih pola referensi: **DDD-lite + Clean Architecture per module** (lihat `modules/iam/` di struktur target).
- [ ] Migrasi `use-cases/auth/*` → `modules/iam/application/use-cases/*`
- [ ] Migrasi `use-cases/user/*` → `modules/iam/application/use-cases/*` (gabung dengan auth → modul `iam`)
- [ ] Migrasi `use-cases/chat/*` → `modules/chat/application/use-cases/*`
- [ ] Migrasi `use-cases/admin/*` + `use-cases/market/*` ke modul masing-masing
- [ ] Migrasi `contexts/news/*` → `modules/news/*` (hanya rename + tambah `presentation/`, `events/`, `ioc/`)
- [ ] Setiap modul expose `index.ts` barrel HANYA public API:
  ```ts
  // modules/iam/iam.module.ts
  export * from './presentation/routes';
  export { registerIamContainer } from './ioc/register';
  export type { UserLoggedIn } from './domain/events';
  ```
- [ ] Hapus folder lama (`application/services` campur, `use-cases/*` flat, `contexts/news/*`).

**Deliverable:** Semua modul pakai satu pola, `arch-test` hijau, semua test lama tetap lulus.

### Fase 2 — Komunikasi Lintas Modul via Event Bus (Minggu 7–9)
**Tujuan:** decouple domain, siap outbox.

- [ ] Implement **in-process EventBus** di `infrastructure/messaging/`:
  ```ts
  bus.publish(new UserLoggedIn(userId, deviceId, at))
  bus.subscribe(UserLoggedIn, async (e) => { /* audit log handler in admin */ })
  ```
- [ ] Tambah domain events di tiap modul: `UserRegistered`, `UserLoggedIn`, `MessageSent`, `TradeAnalyzed`, `NewsPublished`.
- [ ] Refactor call site langsung (mis. auth → audit log) jadi `bus.publish`.
- [ ] Siapkan interface **Outbox Port** (`OutboxRepository`) — impl default pakai tabel `outbox_events` di schema modul yang sama, poller terpisah publish ke bus.
- [ ] (Opsional) Integrasi **Transactional Outbox** agar consistency tanpa 2PC.

**Deliverable:** Tidak ada `import` langsung antar modul untuk event-driven flow; arch-test enforcement diperketat.

### Fase 3 — HTTP/WS/SSE Gateway & API Contracts (Minggu 10–12)
**Tujuan:** satu pintu masuk, kontrak eksplisit.

- [ ] Bikin `interfaces/http/`:
  - `app.ts` — Express factory (tanpa route), mount global middlewares
  - `route-registry.ts` — kumpulkan `Router` dari tiap modul
  - `error-handler.ts`, `request-id.ts`, `auth-guard.ts` (di shared)
  - `health.ts` — `/healthz`, `/readyz` (cek DB, Redis, outbox poller)
- [ ] Setiap modul daftarkan route-nya via DI:
  ```ts
  container.register('routes.iam', asValue(iamRouter));
  ```
- [ ] Generate **OpenAPI** per modul dari zod schema (`zod-to-openapi` atau `@asteasolutions/zod-to-openapi`).
- [ ] Tambah API versioning: `/v1/...` dan header `API-Version`.
- [ ] Pisahkan WS gateway (`interfaces/ws/`) — saat ini chat WS; refactor jadi `modules/chat/presentation/ws/` + `interfaces/ws/hub.ts` (router berdasarkan path).
- [ ] SSE Notifier → `modules/notification/` (publisher & subscriber) di belakang `RealtimePort`.

**Deliverable:** `GET /v1/openapi.json` tersedia, semua endpoint di-version-kan.

### Fase 4 — Persistence Isolation (Minggu 13–14)
**Tujuan:** setiap modul punya schema sendiri, siap pisah DB.

- [ ] Prefix semua migrasi dengan modul: `iam_001_create_users.sql`, `market_001_create_symbols.sql`.
- [ ] Pindahkan tabel-tabel existing ke schema per-modul (rename `users` → `iam.users`).
- [ ] Repository hanya boleh query schema-nya sendiri — tambahkan `SET search_path TO iam, public` per connection.
- [ ] Unit of Work pattern per request — agar transaction bisa span modul tanpa bocor coupling.
- [ ] Arch-test: repository import `pg` HANYA dari `infrastructure/persistence/`.

**Deliverable:** Tidak ada lagi `SELECT * FROM users` (tanpa schema), semua lewat schema-qualified.

### Fase 5 — Hardening & Observability (Minggu 15–16)
**Tujuan:** production-ready.

- [ ] OpenTelemetry traces end-to-end (HTTP → use-case → repo → DB).
- [ ] Structured logs: `{ traceId, spanId, module, userId, action, durationMs, ok }`.
- [ ] Rate limit per-user/per-route (sudah ada `express-rate-limit`; perlu di-keying ke user).
- [ ] Circuit breaker untuk adapter eksternal (captcha, oauth, email) — pakai `opossum`.
- [ ] Per-module **integration tests** (vitest + testcontainers Postgres).
- [ ] Load test ringan (k6) untuk endpoint kritis: login, chat stream, market data.
- [ ] Dokumentasi `docs/architecture.md` (C4 model: context + container + component).

**Deliverable:** Grafana/Tempo dashboard dasar, runbook insiden.

### Fase 6 (Opsional, Kuartal Berikutnya) — Selective Service Extraction
Lakukan **hanya jika** minimal 2 dari sinyal berikut terpenuhi:

1. Satu modul butuh 10× scaling atau scaling profile berbeda (mis. `chat` AI streaming vs `iam` request pendek).
2. ≥ 2 tim terblokir deploy satu sama lain.
3. Ada regulatory isolation (mis. payment PCI).

Kandidat urutan ekstraksi (jika dibutuhkan):
1. `notification` — hampir infra-only, paling rendah coupling.
2. `chat` — AI workload, scaling independen.
3. `iam` — perlu hati-hati (banyak modul depend on events).

Saat ekstraksi: tiap service **WAJIB punya DB sendiri** (no shared DB) dan API contract harus sudah final (fase 3).

---

## 4. Konvensi & Aturan Tim

| Topik | Aturan |
|---|---|
| Module name | lowercase, singular noun: `iam`, `market`, `chat`, `news`, `messaging`, `admin`, `notification`, `billing` |
| File name | `PascalCase.ts` untuk class/value-object/entity, `camelCase.ts` untuk use-case (`LoginUseCase.ts`), `kebab-case.ts` untuk util |
| Use-case | 1 file = 1 use-case; extend `BaseUseCase<Input, Output>`; return `Result<T, AppError>` |
| Repository | Interface di `domain/ports/`, impl di `infrastructure/persistence/`; hanya boleh expose method yang dipakai use-case |
| Event | `domain/events/<Name>Event.ts`; immutable; published via `EventBus` |
| Test | Unit test sejajar dengan source (`*.test.ts`); integration test di `tests/integration/` |
| Import silang | DILARANG. Hanya lewat barrel `modules/<m>/index.ts` atau event bus. Wajib arch-test hijau. |
| DB | Selalu `schema.table` (no naked table names). |
| Error | Throw `AppError`/`DomainError` dari `shared/errors/`; biarkan `error-handler` middleware translate ke HTTP. |
| Logging | `logger.child({ module: 'iam', action: 'login' })`; tidak ada `console.log`. |
| Commit | Conventional Commits; satu PR = satu concern (1 modul / 1 fase). |

---

## 5. Anti-Pattern yang Harus Dihindari (2026 rangkuman)

1. **Big-Bang Rewrite** — refactor inkremental, strangler-fig, branch per fase.
2. **Shared database across "microservices"** — saat ekstraksi nanti, **wajib** DB sendiri per service.
3. **Split by technical layer** (auth-service, db-service) — selalu **split by bounded context**.
4. **Direct cross-module imports** — pakai barrel + event bus saja.
5. **Sync HTTP untuk komunikasi internal** — biasakan async via event bus; sync call hanya via injected port.
6. **Tanpa observability** — microservices tanpa tracing = "distributed monolith" yang debug-nya mustahil.
7. **Tanpa ownership** — setiap modul harus punya owning team / owning engineer di CODEOWNERS.
8. **Microservices prematur** — tetap di modular monolith sampai bukti kebutuhan muncul.

---

## 6. Definition of Done (per fase)

- [ ] `npm run lint` hijau
- [ ] `npm run typecheck` hijau
- [ ] `npm test` hijau
- [ ] `npm run arch:test` hijau (dependency-cruiser + custom)
- [ ] Tidak ada import silang modul internal
- [ ] OpenAPI di-regenerate dan di-commit
- [ ] Migrasi DB reversible (ada `down` migration)
- [ ] README modul ter-update (bagian "How to use this module")
- [ ] CODEOWNERS di-set untuk folder modul baru

---

## 7. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Refactor terlalu agresif, fitur mandek | Branch per fase, merge setelah CI hijau + 1 minggu staging tanpa rollback |
| Modul bocor coupling via shared entity | Larang `import { Entity }` antar modul; selalu lewat DTO/Event/Port |
| Test lama gagal karena path berubah | Fase 1 kerjakan di branch terpisah, pertahankan `use-cases/*` lama sampai modul baru punya test sendiri |
| Performa turun karena event bus overhead | In-process bus = 0 network; ukur p95, optimasi hanya jika terbukti |
| Tim belum familiar DDD | Mulai dari modul terkecil (`market` atau `notification`); pair-programming + ADR |

---

## 8. Referensi (2026)

- Sam Newman, *Building Microservices* 2nd Ed.
- Martin Fowler — "MonolithFirst"
- Shopify Eng — "The Modular Monolith: Rails Architecture at Shopify"
- Segment Eng — "Goodbye Microservices"
- *Microservices vs Modular Monolith in 2026* — dev.to/codewithamrendra
- *Modern Backend Architecture: Monolith vs Microservices in 2026* — nirajiitr.com
- *Backend Architecture 2026* — precisionaiacademy.com
- Spring Modulith docs — spring.io/projects/spring-modulith
- *Backend Architecture Patterns Guide 2026* — codelit.io
- *Software Architecture Patterns Guide 2026* — masterlablearn.com
- Hexamodulith template — github.com/stavros82/hexamodulith
- NestJS Nx Modular Monolith — github.com/felipfr/nestjs-nx-modular-monolith-microservices
- WunderGraph — Strangler + BFF pattern (arsip; konsep masih valid)

---

**Ringkasan satu kalimat:**
> Pertahankan *satu deployable*, tapi pecah jadi **bounded contexts** dengan **module boundary enforcement**, **schema per modul**, **in-process event bus**, **OpenAPI contracts**, dan **observability by default** — microservices diekstrak hanya saat bukti kebutuhan muncul, bukan karena trend.
