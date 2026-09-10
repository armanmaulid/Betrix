# Phase 2 — Drizzle ORM + PostgreSQL Foundation

## Objective
Replace the custom `pg`/raw SQL migration composition with a typed Drizzle database layer while preserving schema semantics and allowing explicit SQL where appropriate.

## Current verified state
The repository currently uses PostgreSQL through `pg` and has a custom migration runner under `Backend/src/data/orm/migrate.ts`. Do not assume the existing SQL is disposable: inventory every migration and constraint first.

## Target architecture
```text
modules -> application abstractions -> DatabasePort/transaction boundary
                                      -> Drizzle/PostgreSQL
```

Feature modules should consume repository interfaces or application-level persistence abstractions. Domain code must not import Drizzle.

## Schema principles
1. PostgreSQL remains the source of truth.
2. Preserve existing constraints unless a deliberate schema change is approved.
3. Add explicit foreign keys/indexes where current behavior requires them.
4. Use UUID/identifier strategy consistently with existing data unless migration proves a safe change.
5. Timestamp semantics must be explicit (UTC).
6. Money/credit/token pricing uses integer fixed-point values, never floating point.
7. Auth identity tables are separated conceptually from Betrix profile/domain tables.
8. Credits are no longer represented only by `users.credits` after billing migration.

## Migration workflow
- Introduce Drizzle schema definitions.
- Generate migrations for new schema changes.
- For legacy schema parity, create an explicit baseline/adoption procedure rather than attempting to recreate an already-populated database blindly.
- Test from an empty database.
- Test against a copy/snapshot of representative existing data.
- Verify indexes, foreign keys, nullability, defaults and enum behavior.

## Required database modules
- database module/provider
- Drizzle client
- transaction helper
- health check
- migration command
- test database setup

## Do not do
- Do not mix multiple migration authorities indefinitely.
- Do not let random feature code execute schema DDL.
- Do not convert every SQL query mechanically if an existing query is clearer and Drizzle supports typed SQL safely.
- Do not introduce an ORM abstraction layer above Drizzle merely to hide Drizzle syntax from infrastructure.

## Acceptance criteria
- [ ] Drizzle connection works in Nest.
- [ ] Empty DB can be migrated deterministically.
- [ ] Existing representative DB/data can be adopted without loss.
- [ ] Transactions are tested.
- [ ] Critical repositories have parity tests.
- [ ] Old migration runner is not the authority after cutover.
- [ ] Rollback/forward migration procedure is documented.
