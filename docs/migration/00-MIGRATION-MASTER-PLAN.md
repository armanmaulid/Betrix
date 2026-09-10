# Betrix Backend Migration — Master Execution Plan

## 1. Tujuan

Migrasikan backend Betrix dari Express + tsyringe + `pg`/SQL migration runner + custom authentication/session stack menjadi:

- NestJS + Fastify
- Nest dependency injection
- Better Auth sebagai identity/session authority
- Drizzle ORM + PostgreSQL
- Database-driven LLM/provider/model/pricing registry
- Token-based billing dengan reservation → provider usage → settlement
- Redis untuk cache/rate-limit/queue/supporting infrastructure, bukan sebagai custom auth-session authority kecuali ada kebutuhan terukur
- BullMQ untuk pekerjaan background yang harus terkoordinasi/distributed
- API versioning (`/api/v1`, `/api/v2`) sejak awal
- Structured observability dan graceful shutdown

## 2. Source-of-truth repository

Repository: `armanmaulid/Betrix`
Branch target: default/main branch.

Fakta source yang sudah diverifikasi:

- `Backend/src/main.ts` hanya memuat dotenv dan memanggil `startServer()`.
- `Backend/src/bootstrap/startServer.ts` saat ini membuat Express app, memasang middleware Express/Passport, mendaftarkan dependency/event/routes, menjalankan startup/background jobs, dan melakukan graceful shutdown.
- `Backend/src/bootstrap/container.ts` adalah composition root tsyringe yang besar.
- `Backend/src/data/orm/migrate.ts` adalah custom SQL migration runner.
- `Backend/src/data/repositories/PgCreditRepository.ts` sudah memakai transaction + conditional update untuk debit credit.
- `ModelPolicy.ts` saat ini memetakan task ke tier dan fixed credit cost.
- `SendMessageUseCase.ts` dan streaming use case sudah memperoleh token usage dari AI provider.

## 3. Prinsip non-negotiable

1. Jangan rewrite business/domain logic tanpa alasan.
2. Jangan menyalin bug/kompleksitas framework lama ke NestJS.
3. Domain tidak boleh bergantung pada NestJS, Fastify, Drizzle, Redis, Better Auth, atau SDK LLM.
4. HTTP versioning hanya berada di presentation/API boundary.
5. Database adalah source of truth untuk model LLM dan pricing setelah migrasi fase LLM selesai.
6. User charge harus dapat diaudit dan direkonstruksi dari usage + price version.
7. Jangan menggunakan floating point untuk saldo/charge credit.
8. Jangan menyimpan API key provider sebagai plaintext di tabel model.
9. Model/provider yang pernah direferensikan oleh usage tidak boleh di-hard-delete secara default; gunakan archive/disable.
10. Breaking API change harus masuk version baru; perubahan backward-compatible tetap di version yang sama.
11. Semua phase harus punya tests dan acceptance criteria sebelum phase berikutnya dimulai.
12. Jangan menghapus implementasi lama sebelum replacement terbukti parity.

## 4. Urutan phase

### Phase 0 — Baseline & characterization

Tujuan: mengunci behavior saat ini sebelum migrasi.

Output:
- API contract inventory
- auth behavior tests
- chat/non-streaming/streaming tests
- credit transaction tests
- token usage tests
- background-job behavior inventory
- migration inventory
- rollback plan

Gate: test suite baseline hijau dan contract inventory lengkap.

### Phase 1 — NestJS + Fastify foundation + API v1

Output:
- Nest application bootstrap
- Fastify adapter
- ConfigModule
- global validation/error handling
- request ID/correlation ID
- health/readiness endpoints
- `/api/v1` routing
- OpenAPI per API version
- initial module boundaries

Gate: application boot, health, one migrated vertical slice, tests, build.

### Phase 2 — Drizzle + database foundation

Output:
- Drizzle schema
- migration workflow
- DB module/provider
- transaction abstraction
- parity for existing tables
- migration verification

Gate: fresh DB migration + existing DB compatibility validated.

### Phase 3 — Better Auth

Output:
- Better Auth integration isolated in AuthModule
- registration/login/logout/session/email verification/Google OAuth parity
- domain profile separated from identity
- migration strategy for existing users
- removal of Passport/custom session authority after cutover

Gate: auth parity + security regression tests + rollback procedure.

### Phase 4 — LLM registry

Output:
- providers/models/configuration in DB
- model capabilities
- task-to-model assignment
- price versions
- admin CRUD
- model resolver

Gate: no runtime dependency on `MODEL_CHEAP`, `MODEL_BALANCED`, `MODEL_DEEP` for normal model selection.

### Phase 5 — Billing/token charging

Output:
- wallet
- immutable ledger
- usage records
- reservation/settlement
- exact token charging
- historical price snapshots
- idempotency
- refunds for failed provider calls

Gate: concurrent billing tests and reconciliation tests pass.

### Phase 6 — Chat migration

Output:
- v1 compatibility controller
- v2 clean contract where required
- LLM service/provider adapters
- streaming usage settlement
- removal of fixed tier charge from normal flow

Gate: production-like chat tests and billing reconciliation pass.

### Phase 7 — Remaining HTTP modules

Migrate users, market, news, messaging, analytics, admin and other routes vertical-by-vertical.

Gate: no remaining Express controller/router dependency in active API path.

### Phase 8 — Background jobs + infrastructure lifecycle

Output:
- BullMQ queues/workers where appropriate
- Nest lifecycle for MT5 long-lived connection
- Redis-backed coordination
- graceful shutdown

Gate: multiple API instances do not duplicate singleton jobs.

### Phase 9 — Cleanup/decommission

Remove only after evidence:
- Express
- Passport
- tsyringe
- custom session repository
- fixed `ModelPolicy` pricing
- custom migration runner
- obsolete auth middleware
- obsolete route registration
- obsolete background interval implementation

## 5. Definition of Done for every phase

A phase is complete only when:

- source compiles
- lint passes
- relevant unit/integration tests pass
- migration/rollback behavior is documented
- no new `any` or unsafe casts are introduced without justification
- API contract changes are documented
- logs/metrics are present for operationally important paths
- security-sensitive changes have explicit tests
- old implementation remains available if rollback still requires it
- acceptance criteria in the phase document are checked

## 6. Execution rule for Claude Code

Execute one phase at a time. Before editing:

1. inspect the current repository state;
2. verify assumptions against source;
3. identify exact files affected;
4. implement the smallest coherent slice;
5. run tests/build/lint relevant to that slice;
6. report changed files, commands, failures, and remaining work;
7. do not silently skip acceptance criteria;
8. do not begin the next phase until the current phase gate passes.

If repository state differs from this document, source code wins and the plan must be updated before implementation.
