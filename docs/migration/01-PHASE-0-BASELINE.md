# Phase 0 — Baseline, Contract Inventory, Characterization Tests

## Objective
Lock current behavior before migration. This phase must not change production behavior except test-only instrumentation that is demonstrably safe.

## Verified current architecture
- `Backend/src/main.ts` calls `startServer()`.
- `Backend/src/bootstrap/startServer.ts` creates Express, registers middleware/routes/dependencies/events, starts background jobs, and owns shutdown.
- `Backend/src/bootstrap/container.ts` is the tsyringe composition root.
- `Backend/src/data/orm/migrate.ts` runs raw SQL migrations.
- `PgCreditRepository` performs credit debit/add inside PostgreSQL transactions.
- Chat use cases already receive input/output token usage from the AI layer.
- `ModelPolicy` currently maps task types to fixed tiers/costs.

## Claude Code instructions
1. Inspect the complete current tree before editing.
2. Inventory every HTTP endpoint, method, auth requirement, request shape, response shape, status code, SSE event, and error response.
3. Inventory auth flows: registration, login, logout, session validation, refresh if present, email verification, password reset if present, Google OAuth, device enforcement, CAPTCHA, rate limits.
4. Inventory credit flows and all transaction action types.
5. Inventory every AI call path, model selection path, token usage path, streaming path, cache behavior, refund behavior.
6. Inventory all DB tables, indexes, foreign keys, triggers, enums and migrations.
7. Inventory background jobs and determine whether each is singleton, periodic, event-driven, or long-lived connection management.
8. Inventory Redis keys and TTL semantics.
9. Inventory frontend assumptions about API contracts, credits, auth/session, models, and task tiers.
10. Add characterization tests before replacing implementations.

## Required artifacts
Create/update:
- `docs/migration/baseline/API-CONTRACT.md`
- `docs/migration/baseline/AUTH-CONTRACT.md`
- `docs/migration/baseline/BILLING-CONTRACT.md`
- `docs/migration/baseline/LLM-CONTRACT.md`
- `docs/migration/baseline/DATABASE-INVENTORY.md`
- `docs/migration/baseline/JOBS-INVENTORY.md`
- `docs/migration/baseline/REDIS-INVENTORY.md`
- `docs/migration/baseline/FRONTEND-CONTRACT.md`
- tests covering critical behavior.

## Rules
- Do not infer undocumented behavior. Read source/tests.
- If behavior is ambiguous, mark it `UNKNOWN` and locate the code path before proceeding.
- Capture actual status codes and error bodies, not idealized contracts.
- Capture backward compatibility requirements from frontend consumers.

## Acceptance criteria
- [ ] All current routes inventoried.
- [ ] Auth flows inventoried.
- [ ] Billing/credit flows inventoried.
- [ ] LLM and token usage flows inventoried.
- [ ] DB schema and migrations inventoried.
- [ ] Jobs and Redis usage inventoried.
- [ ] Critical characterization tests pass.
- [ ] Baseline `build`, `lint`, and test commands documented.
- [ ] No migration implementation started until baseline is accepted.
