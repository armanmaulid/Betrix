# Contributing to Betrix Backend

> Module structure, conventions, and contribution guide for the Betrix backend.
> For architecture overview, see [`docs/architecture.md`](./docs/architecture.md) (TODO Fase 0.6).
> For refactoring status, see [`docs/refactoring-plan-2026.md`](./docs/refactoring-plan-2026.md) + [`docs/EXECUTION_LOGS.md`](./docs/EXECUTION_LOGS.md).

---

## Module Structure (target — Fase 1 in progress)

```
src/
├── main.ts                          # bootstrap Express + module registry
├── bootstrap/                       # composition root
│   ├── config.ts                    # typed env (zod)
│   ├── container.ts                 # tsyringe container setup
│   └── startServer.ts
│
├── shared/                          # cross-cutting utilities (NO business logic)
│   ├── kernel/                      # LoggerPort, EventBus, Clock, IdGenerator
│   ├── errors/                      # AppError, Result<T,E>
│   └── di/                          # container tokens & helpers
│
├── modules/                         # bounded contexts (one per business domain)
│   ├── iam/                         # auth, user, session
│   ├── chat/                        # AI chat
│   ├── market/                      # symbols, calendar
│   ├── messaging/                   # user-to-user
│   ├── admin/                       # analytics, audit
│   ├── news/                        # news feed
│   └── notification/                # SSE, email
│
├── infrastructure/                  # cross-module infra (swappable)
│   ├── persistence/                 # DB adapters
│   ├── cache/                       # Redis adapters
│   ├── messaging/                   # EventBus impl
│   ├── realtime/                    # WS, SSE hubs
│   └── observability/               # logger, OTel
│
├── interfaces/                      # delivery layer
│   ├── http/                        # Express app, route registry
│   ├── ws/
│   └── sse/
│
├── legacy/                          # pre-refactor code (to be removed in Fase 2)
│
├── config/                          # legacy: env.ts, passport.ts, deviceEnforcement.ts
├── context/                         # legacy: constants, errors, logging, middleware, settings
├── domain/                          # legacy: entities, repos (interfaces), events, ports
├── application/                     # legacy: use-cases, services, dto, mappers
├── data/                            # legacy: pg/redis/external clients, repositories
├── presentation/                    # legacy: controllers, routes, middleware
└── background/                      # legacy: cron jobs
```

---

## Conventions

### Module name
- lowercase, singular noun: `iam`, `market`, `chat`, `news`, `messaging`, `admin`, `notification`
- NO technical layer names (e.g. `auth-service`, `db-service`)

### File name
- `PascalCase.ts` for class/value-object/entity, `camelCase.ts` for use-case (`LoginUseCase.ts`), `kebab-case.ts` for util
- 1 file = 1 responsibility

### Use case
- 1 file = 1 use case
- Implements `BaseUseCase<Input, Output>` (or `UseCasePort`)
- Returns `Result<T, AppError>` (preferred) or throws `AppError`
- No external side effects in constructor — inject all dependencies

### Repository
- Interface in `domain/ports/`
- Implementation in `infrastructure/persistence/` (or `modules/<m>/infrastructure/`)
- Method names describe intent, not SQL: `findByEmail`, not `selectUserByEmail`

### Event
- `domain/events/<Name>Event.ts` — immutable, exported as class
- Published via `EventBus` (in-process, see `shared/kernel/EventBus.ts`)
- Subscribers in `modules/<m>/events/handlers/`

### Database
- Always schema-qualified: `iam.users`, `market.broker_symbols`, NEVER `users` or `public.users`
- Each module owns its schema (no cross-schema joins in repo — use event bus for cross-module)
- Idempotent migrations: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`

### Error
- Throw `AppError` / specific subclass (`ValidationError`, `NotFoundError`, etc.)
- Do NOT use generic `Error` in domain/application layer
- Error handler in `interfaces/http/middleware/errorHandler.ts` translates to HTTP

### Logging
- Use `logger.child({ module, useCase })` to attach context
- Never `console.log/error` (enforced by `tools/arch-test/no-console-log.test.ts`)
- Levels: `trace` < `debug` < `info` < `warn` < `error` < `fatal`

### Import rules (enforced by `dependency-cruiser`)
- Domain layer CANNOT import infrastructure, interfaces, or other modules
- Application layer CANNOT import presentation
- Module A CANNOT import module B's internals (only via barrel or event bus)
- `shared/` CANNOT import `modules/` or `infrastructure/`

### Commit
- Conventional Commits: `feat(scope)`, `fix(scope)`, `chore(scope)`, `docs(scope)`, `refactor(scope)`
- 1 PR = 1 concern (1 module / 1 phase / 1 fix)
- Always run `npm run lint && npm run typecheck && npm test && npm run test:arch` before push

---

## Commands

```bash
# Development
npm run dev                  # tsx watch src/main.ts
npm run build                # tsc compile
npm start                    # node dist/main.js

# Database
npm run db:generate          # drizzle-kit generate (after Fase 5)
npm run db:migrate           # drizzle-kit migrate
npm run db:push              # drizzle-kit push (dev only)
npm run db:studio            # drizzle-kit studio
npm run db:migrate:legacy    # current multi-file SQL runner

# Tests
npm test                     # vitest run
npm run test:watch
npm run test:coverage
npm run test:arch            # architecture tests (no-console, layer purity, module structure)

# Quality
npm run lint                 # eslint
npm run lint:fix
npm run typecheck            # tsc --noEmit
npm run deps:validate        # dependency-cruiser (module boundary)

# Dependencies
npm run deps:check           # check for updates
npm run deps:update          # ncu -u && npm install
```

---

## Code Style

- **TypeScript strict mode** — no `any`, no `// @ts-ignore`
- **ES modules** — `import/export`, NO `require`
- **Decorators OK** for DI (`tsyringe` `@injectable`, `@inject`) and zod (openapi metadata)
- **Async/await** — no callbacks, no `.then().catch()` chains in production code (use `Result` for error handling)
- **Path aliases** — prefer `@modules/iam/...` over relative paths

---

## How to Add a New Use Case

1. Create file `src/modules/<module>/application/use-cases/<Name>UseCase.ts`
2. If `iam`: `src/modules/iam/application/use-cases/LoginUseCase.ts`
3. Define interface (input port) in `src/modules/<module>/domain/ports/<Name>UseCasePort.ts` (Fase 2)
4. Inject dependencies via constructor (repositories, services)
5. Return `Result<T, AppError>` or throw `AppError`
6. Register in `src/modules/<module>/ioc/register.ts`
7. Add controller route in `src/modules/<module>/presentation/http/routes/`
8. Write unit test in `src/modules/<module>/tests/`

---

## How to Add a New Bounded Context

1. Create folder `src/modules/<new-context>/`
2. Sub-folders: `domain/`, `application/`, `infrastructure/`, `presentation/`, `events/`, `ioc/`, `tests/`
3. Create `src/modules/<new-context>/<new-context>.module.ts` — barrel export (public API)
4. Create `src/modules/<new-context>/ioc/register.ts` — tsyringe registration
5. Add migration: `db/migrations/00X_<new-context>.sql`
6. Register module in `src/bootstrap/container.ts`
7. Run `npm run test:arch` to verify no boundary violations
8. Run `npm run typecheck` to verify no broken imports

---

## When in Doubt

- **Architecture question** → [`docs/refactoring-plan-2026.md`](./docs/refactoring-plan-2026.md)
- **Execution history** → [`docs/EXECUTION_LOGS.md`](./docs/EXECUTION_LOGS.md) (append-only)
- **Past decision** → search `docs/adr/` (TODO: write ADRs in Fase 0.6)
- **Block on something** → ask before implementing
