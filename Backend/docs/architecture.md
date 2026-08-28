# Betrix Backend — Architecture (C4 Model)

> Status: **in transition** (Fase 0 → Fase 1 of [`refactoring-plan-2026.md`](./refactoring-plan-2026.md))
> Last updated: 2026-08-28

This document describes the **target architecture** (post-refactor). For the current state, see the **Code Map** section at the bottom.

---

## Level 1 — System Context

```
┌─────────────┐         ┌─────────────────────┐
│   Frontend  │ ──────▶ │   Betrix Backend    │
│  (Next.js,  │  HTTPS  │  (Node.js, Fastify  │
│   Vite)     │ ◀────── │    + Express)       │
└─────────────┘  WS/SSE │                     │
                        │  ┌───────────────┐  │
                        │  │   Database    │  │
                        │  │  (Postgres /  │  │
                        │  │   Neon /      │  │
                        │  │   Supabase)   │  │
                        │  └───────────────┘  │
                        │  ┌───────────────┐  │
                        │  │     Cache     │  │
                        │  │  (Redis /     │  │
                        │  │   Upstash)    │  │
                        │  └───────────────┘  │
                        │  ┌───────────────┐  │
                        │  │   AI Models   │  │
                        │  │  (Anthropic,  │  │
                        │  │   OpenAI)     │  │
                        │  └───────────────┘  │
                        │  ┌───────────────┐  │
                        │  │    Market     │  │
                        │  │    Feeds      │  │
                        │  │ (MT5, Finnhub)│  │
                        │  └───────────────┘  │
                        │  ┌───────────────┐  │
                        │  │    Email      │  │
                        │  │    (SMTP)     │  │
                        │  └───────────────┘  │
                        └─────────────────────┘
```

**External actors:**
- **Users** — humans using the frontend (web + admin)
- **AI providers** — Anthropic, OpenAI (for chat orchestration)
- **Market data** — MT5 bridge (WebSocket), Finnhub REST (polling)
- **Email provider** — SMTP (Gmail)

---

## Level 2 — Containers (Target: Modular Monolith)

```
┌──────────────────────────────────────────────────────────────────┐
│                    Betrix Backend (Node.js)                      │
│                                                                  │
│  ┌──────────────────────┐    ┌──────────────────────┐            │
│  │  HTTP Gateway        │    │  Realtime Gateway    │            │
│  │  (Fastify + Express  │    │  (WS for chat,       │            │
│  │   via strangler-fig) │    │   SSE for notify)    │            │
│  └──────────┬───────────┘    └──────────┬───────────┘            │
│             │                           │                        │
│  ┌──────────▼───────────────────────────▼───────────┐            │
│  │              Event Bus (in-process)              │            │
│  │  (swap-ready to NATS JetStream, Redis Streams)   │            │
│  └──────────┬───────────────────────────────────────┘            │
│             │                                                    │
│  ┌──────────▼──────────────────────────────────────────────────┐ │
│  │              Bounded Contexts (Modules)                    │ │
│  │                                                            │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │ │
│  │  │  iam   │ │  chat  │ │ market │ │messaging│ │ admin  │  │ │
│  │  │        │ │        │ │        │ │        │ │        │  │ │
│  │  │domain  │ │domain  │ │domain  │ │domain  │ │domain  │  │ │
│  │  │  app   │ │  app   │ │  app   │ │  app   │ │  app   │  │ │
│  │  │ infra  │ │ infra  │ │ infra  │ │ infra  │ │ infra  │  │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘  │ │
│  │                                                            │ │
│  │  + news, notification                                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Infrastructure Layer (swappable adapters)               │   │
│  │                                                            │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │   │
│  │  │ Persistence  │  │ Cache        │  │ Observability│    │   │
│  │  │ - Postgres   │  │ - Redis      │  │ - Pino log   │    │   │
│  │  │ - Neon       │  │ - Upstash    │  │ - OTel trace │    │   │
│  │  │ - Supabase   │  │              │  │ - health     │    │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

**Tech stack (target):**
- **Runtime:** Node.js 22 LTS
- **HTTP:** Fastify 5 (with `@fastify/express` adapter during migration)
- **WS:** `@fastify/websocket`
- **SSE:** `@fastify/sse`
- **Validation:** zod 4
- **Logger:** Pino 10
- **ORM:** Drizzle 0.45 + drizzle-kit 0.31
- **Auth:** better-auth 1.4
- **DB drivers:** pg 8 (local), `@neondatabase/serverless` (Neon), `@supabase/supabase-js` (Supabase)
- **Cache:** ioredis 6 (Redis), @upstash/redis (HTTP-based)
- **DI:** tsyringe 4
- **Testing:** vitest 4 + custom arch-test runner
- **Observability:** OpenTelemetry SDK

---

## Level 3 — Components (per Bounded Context)

Each module follows the same structure (hexagonal per module):

```
modules/<context>/
├── domain/                # Pure business logic (zero deps)
│   ├── entities/          # User, Chat, Order, etc.
│   ├── value-objects/     # Email, Money, etc.
│   ├── events/            # UserRegistered, MessageSent, etc.
│   └── ports/             # Interfaces for use cases + repositories
│
├── application/           # Use cases + orchestration
│   ├── use-cases/         # LoginUseCase, SendMessageUseCase, etc.
│   ├── services/          # Cross-use-case logic
│   ├── mappers/           # DTO mappers
│   └── dto/               # Input/Output DTOs
│
├── infrastructure/        # Adapters (concrete implementations)
│   ├── persistence/       # PgXxxRepository, NeonXxxRepository
│   ├── external/          # SMTP, OAuth, AI adapters
│   └── cache/             # Redis adapters
│
├── presentation/          # HTTP/WS/SSE delivery
│   ├── http/
│   │   ├── controllers/   # Request handlers
│   │   ├── routes/        # Route definitions + zod schemas
│   │   └── middlewares/   # Auth, validation, error handling
│   ├── ws/                # WebSocket handlers
│   └── sse/               # SSE handlers
│
├── events/                # Event subscribers
│   └── handlers/          # Handle events from other modules
│
├── ioc/                   # tsyringe registration
│   └── register.ts
│
├── tests/                 # Integration tests
│
├── <context>.module.ts    # Barrel export (public API)
└── README.md
```

**Dependency direction:**
```
presentation ─┐
              ├──▶ application ──▶ domain
infrastructure┘                   ▲
                                  │
                                shared
```

**Rules (enforced by `dependency-cruiser`):**
- `domain/` cannot import `application/`, `infrastructure/`, `presentation/`, or other modules
- `application/` cannot import `presentation/`
- `infrastructure/` cannot import `application/`, `presentation/`, or other modules' domain
- Cross-module communication: only via barrel `<context>.module.ts` or event bus

---

## Level 4 — Code Map (Current State, pre-Fase 1)

> The current codebase is **transitioning**. Some files already follow the new structure, others are still in legacy layout.

### Legacy (to be migrated in Fase 1)

```
src/
├── domain/                        # FLAT — entities + repo interfaces from ALL modules
│   ├── entities/                  # User, ChatMessage, etc. (will move to modules/<m>/domain/)
│   ├── repositories/              # All repo interfaces (will move to modules/<m>/domain/ports/)
│   ├── events/                    # EventDispatcher + all event types
│   ├── ports/                     # Cross-cutting ports (INotifier, EmailPort, etc.)
│   ├── services/                  # AiPromptRegistry, DeviceDomainService, loginPolicy
│   └── value-objects/
│
├── application/                   # FLAT — use-cases from multiple modules
│   ├── use-cases/
│   │   ├── auth/                  # 18 files (will move to modules/iam/application/)
│   │   ├── chat/                  # 4 files (will move to modules/chat/)
│   │   ├── admin/                 # 12 files (will move to modules/admin/)
│   │   ├── market/                # 2 files (will move to modules/market/)
│   │   └── user/                  # 12 files (will move to modules/messaging/)
│   ├── services/                  # AuthService, CaptchaService, SymbolService, etc.
│   ├── mappers/
│   ├── dtos/
│   └── event-handlers/            # ChatLoggingHandler, etc.
│
├── contexts/news/                 # HALF-MIGRATED — only news has bounded context
│   ├── domain/
│   ├── application/
│   └── infrastructure/
│
├── data/                          # pgClient, redisClient, all repos (impl), external services
│   ├── repositories/              # All repo impls (will move to modules/<m>/infrastructure/persistence/)
│   ├── external/                  # EmailService, FinnhubClient, AIClient
│   ├── cache/
│   └── orm/
│
├── presentation/                  # Express controllers, routes, middleware
│   ├── controllers/               # AuthController, ChatController, etc.
│   ├── routes/                    # v1/{auth,chat,admin,market,user,news}.routes.ts
│   └── middleware/                # auth, admin, validate, streamAuth
│
├── background/                    # cron jobs (Mt5SubscriptionJob, DailySyncJob)
├── config/                        # env.ts, passport.ts, deviceEnforcement.ts
├── core/                          # legacy utils (logging, errors, middleware, constants)
└── infrastructure/
    ├── sse/                       # SseNotifier
    └── observability/             # NEW (Fase 0): Pino logger
```

### New (Fase 0)

```
src/
├── shared/                        # NEW (Fase 0)
│   ├── kernel/                    # LoggerPort
│   └── errors/                    # AppError, Result<T,E>
│
├── bootstrap/                     # NEW (Fase 0.4)
│   ├── config.ts                  # typed env + DB provider registry
│   └── container.ts               # tsyringe root container
│
└── (modules/ — to be created in Fase 1)
```

### Database

```
Postgres (single instance, multi-schema)
├── iam                # users, sessions, user_devices, email_verifications, failed_login_attempts
├── chat               # chat_logs, token_usage
├── market             # broker_symbols, calendar_events, symbol_sync_metadata
├── messaging          # messages, message_notification_preferences
├── admin              # admin_actions, user_activity_logs
├── billing            # credit_transactions
├── news               # news_articles
└── public             # LEGACY tables (will be deprecated in Fase 2)
```

---

## Event Flow Example

```
User sends chat message
       │
       ▼
[chat/presentation/ws] receives WS frame
       │
       ▼
[chat/application/use-cases/SendMessageUseCase]
       │
       ├── publishes: ChatMessageSent
       │
       ▼
[EventBus.publish]
       │
       ├── [messaging/events/handlers] (saves to messaging.messages, sends email)
       ├── [admin/events/handlers] (logs to admin.user_activity_logs)
       └── [billing/events/handlers] (deducts credit from billing.credit_transactions)
```

**Key property:** Each handler runs in isolation. If `billing` handler fails, `messaging` and `admin` still complete. Failure is logged, not propagated.

---

## Migration Status

| Phase | Status | Notes |
|---|---|---|
| 0 — Foundation (tooling, logger, errors, configs) | ✅ Done (commit `5c38868` + `91c2c96` + `<latest>`) | |
| 1 — Modular Monolith (migrate 7 modules) | ⏳ Pending | Pilot: `iam` module |
| 2 — Hexagonal (input ports, domain zero-deps) | ⏳ Pending | |
| 3 — Event Bus + Outbox | ⏳ Pending | In-process first, outbox later |
| 4 — Fastify Gateway (drop Express) | ⏳ Pending | Strangler-fig |
| 5 — Drizzle ORM + multi-provider DB | ⏳ Pending | Neon/Supabase/local swap |
| 6 — Better Auth (drop Passport) | ⏳ Pending | |
| 7 — Observability (OTel) | ⏳ Pending | |
| 8 — Selective service extraction | ⏳ Optional | Only if evidence warrants |

See [`refactoring-plan-2026.md`](./refactoring-plan-2026.md) for full roadmap.
