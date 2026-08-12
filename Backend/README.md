# Betrix Backend

Backend + AI orchestration layer for **Betrix**, an AI-powered forex signal generation platform. Built with **Clean Architecture / Domain-Driven Design** on **Node.js (ESM) + TypeScript**, it handles auth, real-time market data (via the MT5 bridge and Finnhub), AI chat orchestration with credit billing, and admin/analytics.

---

## Architecture

Dependencies point inward — inner layers (`domain`) have zero knowledge of outer layers (`presentation`, `data`).

```text
src/
├── domain/            # Core business logic — zero framework/infra dependencies
│   ├── entities/       # User, Session, ChatMessage, NewsArticle, etc.
│   ├── repositories/   # Interfaces (ports) for data access
│   ├── services/       # Pure domain logic (MarketDataService, SymbolService, CalendarService, AiPromptRegistry...)
│   ├── value-objects/
│   └── events/          # Domain events + EventDispatcher
│
├── application/       # Application-specific orchestration
│   ├── use-cases/       # Grouped by feature: auth, admin, chat, market, news, user
│   ├── ports/            # Interfaces for external integrations (IBrokerProvider, INewsProvider...)
│   ├── dtos/             # Zod schemas for request validation
│   └── event-handlers/   # Listeners reacting to domain events
│
├── data/               # Infrastructure — database & cache adapters
│   ├── repositories/     # Concrete Pg*/Redis* implementations of domain repositories
│   ├── orm/               # Raw pg client, migration runner
│   ├── cache/             # In-memory GeneralCacheStore
│   └── external/          # FinnhubClient, AI gateway client, MT5 bridge adapters
│
├── presentation/       # HTTP / Express delivery layer
│   ├── controllers/      # Thin HTTP adapters that call use-cases
│   ├── routes/v1/         # Express route definitions
│   └── middleware/        # auth, admin, validate, rate limiting, error handling
│
├── infrastructure/     # System-level infra
│   └── sse/               # Server-Sent Events (SseNotifier)
│
├── core/               # Shared kernel
│   ├── errors/            # Typed AppError / ValidationError, etc.
│   ├── logging/           # Winston logger (daily rotate, request-ID tracking)
│   └── utils/              # crypto, hashing, date/parsing helpers
│
├── background/jobs/    # Scheduled/interval jobs (see below)
├── config/             # Zod-validated env, DI-related config, passport strategy
├── bootstrap/          # DI container wiring, middleware/route registration, server startup
└── main.ts             # Entry point
```

- **DI**: `tsyringe` — controllers resolve use-cases, which resolve repositories, keeping everything mockable.
- **Validation**: `zod` DTOs validate `body`/`query`/`params` on every route via a `validate()` middleware.
- **Auth**: JWT bearer tokens (`authMiddleware`) + Google OAuth (`passport-google-oauth20`) + optional device-fingerprint enforcement (`DEVICE_ENFORCEMENT`).

---

## Tech stack

- **Runtime**: Node.js 20+, TypeScript (ESM, ES2022), run via `tsx` in dev
- **Framework**: Express 4
- **Database**: PostgreSQL via raw `pg` (no ORM — parameterized queries in repositories)
- **Cache / sessions**: Upstash Redis (`@upstash/redis`)
- **AI gateway**: OpenAI-compatible HTTP gateway, model tiers configured via env
- **Market data**: MT5 bridge (WebSocket, `ws`) for OHLC/symbols/calendar; Finnhub for live ticks + news
- **Auth**: `jsonwebtoken`, `bcryptjs`, `passport` + `passport-google-oauth20`
- **Mail**: `nodemailer` (SMTP) for verification/notification emails
- **Security**: `helmet`, `express-rate-limit`, `xss`
- **Logging**: `winston` + `winston-daily-rotate-file`
- **Testing**: `vitest`
- **Lint/format**: ESLint 9 (flat config) + Prettier

---

## API endpoints (`/api/v1`)

| Domain | Endpoints |
|---|---|
| **Health** | `GET /health` — deep check (pings Postgres + Redis) |
| **Auth** | `POST /auth/register`, `POST /auth/login`, `GET /auth/google`, `GET /auth/google/callback`, `POST /auth/logout-by-credentials`, `POST /auth/logout`, `POST /auth/logout-all`, `GET\|POST /auth/verify-email`, `POST /auth/resend-verification`, `PUT /auth/password`, `PUT /auth/email`, `GET /auth/me`, `PUT /auth/profile`, `GET /auth/sessions`, `DELETE /auth/sessions/:fingerprint` |
| **Chat** | `POST /chat`, `POST /chat/stream` (SSE), `GET /chat/history`, `DELETE /chat/session/:sessionId`, `GET /chat/export` |
| **Market** | `GET /market/symbols`, `GET /market/symbols/:symbol`, `GET /market/symbols/category/:category`, `GET /market/calendar`, `GET /market/prices`, `GET /market/prices/:symbol`, `GET /market/prices/all`, `GET /market/ohlc/:symbol/:timeframe`, `GET /market/ohlc/all`, `GET /market/mbook/:symbol`, `GET /market/mbook/all` |
| **News** | `GET /news`, `GET /news/stream` (SSE) |
| **User (`/me`)** | `GET /me/activity`, `GET /me/usage/me`, `GET /me/usage/current-month`, `GET /me/messages`, `GET /me/messages/sent`, `GET /me/messages/thread/:threadId`, `GET /me/messages/:id`, `POST /me/messages/:id/read`, `DELETE /me/messages/:id`, `POST /me/messages`, `GET\|POST /me/messages/preferences` |
| **Admin** | `GET\|PATCH /admin/me`, `GET /admin/users`, `GET\|PUT\|DELETE /admin/users/:id`, `POST /admin/users/:id/reset-password`, `GET /admin/metrics`, `GET /admin/analytics`, `GET /admin/system`, `GET /admin/logs`, `GET /admin/actions`, `GET /admin/actions/export`, `POST /admin/broadcast` |

All routes except `/health`, `/auth/register`, `/auth/login`, and the Google OAuth routes require a valid JWT (`authMiddleware`); `/admin/*` additionally requires `adminMiddleware`.

---

## Background jobs

| Job | Trigger | Action |
|---|---|---|
| **Mt5SubscriptionJob** | On startup | Connects to the MT5 bridge, wires price/OHLC/calendar callbacks into `MarketDataService`/`CalendarService` |
| **DailySyncJob** | Once per day, at broker midnight (`secondsUntilBrokerMidnight`, offset by `MT5_BROKER_UTC_OFFSET`) | Syncs the tradable symbol list from MT5, refreshes the economic calendar |
| **HourlyCleanupJob** | Every 60 min | Runs `SystemCleanupUseCase` — purges expired sessions/tokens and stale data |
| **NewsPollingJob** | Every `FINNHUB_POLLING_INTERVAL_SEC` (default 10s), per provider | Polls news providers, backs off on repeated failures |

Heavy syncs run non-blocking on startup so Express can bind to the port immediately.

---

## Environment variables

Copy to `.env`. Required values have no default below; everything else falls back to what's shown.

```env
# Core
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174

# Database & cache (required)
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Auth (required)
JWT_SECRET=xxx                # min 32 chars
DEVICE_ENFORCEMENT=false

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=

# AI gateway (required)
AI_BASE_URL=https://gateway.example.com/v1
AI_API_KEY=xxx
MODEL_CHEAP=
MODEL_BALANCED=
MODEL_DEEP=
MODEL_CHEAP_MAX_TOKENS=1024
MODEL_BALANCED_MAX_TOKENS=2048
MODEL_DEEP_MAX_TOKENS=4096

# SMTP (SMTP_USER / SMTP_PASS required)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=Betrix

# Market data
FINNHUB_API_KEY=
MT5_BRIDGE_URL=127.0.0.1:8890
MT5_WS_URL=
MT5_HTTP_URL=
FINNHUB_POLLING_INTERVAL_SEC=10
MT5_POLLING_INTERVAL_SEC=10
MT5_BROKER_UTC_OFFSET=3
MT5_TRACK_PRICES=true
MT5_TRACK_OHLC=true
MT5_TRACK_MBOOK=false
MT5_TRACK_CALENDAR=true
MT5_TRACKING_SYMBOLS=EURUSD,GBPUSD,USDJPY,USDCAD,AUDUSD,NZDUSD,USDCHF,XAUUSD,XAGUSD,XTIUSD,BTCUSD,ETHUSD

# Ops / limits
LOG_LEVEL=info
TRUST_PROXY_HOPS=1
RATE_LIMIT_PER_MINUTE=30
RATE_LIMIT_PER_USER_PER_MINUTE=30
RATE_LIMIT_REGISTER_PER_HOUR=5
SESSION_LOOKUP_TIMEOUT_MS=5000
AI_REQUEST_TIMEOUT_MS=30000
AI_STREAM_TIMEOUT_MS=60000
DB_POOL_MAX=20
DB_STATEMENT_TIMEOUT_MS=10000
DB_QUERY_TIMEOUT_MS=15000
SERVER_KEEPALIVE_TIMEOUT_MS=65000
SERVER_HEADERS_TIMEOUT_MS=66000
REQUIRE_EMAIL_VERIFICATION=false
AI_DEBUG_LOGGING=false
```

> Full/authoritative list lives in `src/config/env.ts` (Zod-validated at boot — the process will refuse to start if a required var is missing or malformed).

---

## Getting started

**Prerequisites**: Node.js 20+, a PostgreSQL 15+ database, an Upstash Redis instance (or compatible), and a running [mt5-bridge](https://github.com/armanmaulid/mt5-bridge) if you need live market data.

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env   # then fill in the required values above

# 3. Migrate the database
npm run migrate

# 4. Run
npm run dev          # tsx watch, hot-reload
npm run build         # compile to dist/ (tsc + tsc-alias)
npm start             # run compiled dist/main.js
```

Other scripts:

```bash
npm test              # vitest run
npm run test:watch
npm run test:coverage
npm run lint
npm run lint:fix
```

Whenever a new table is added, re-run `npm run migrate`.

---

## Deployment

Ships as a standard Node 20-alpine Docker image (see `Dockerfile`): `npm ci --production` → copy source → `npm start`, listening on port `3000`. Currently deployed on **Railway**.

---
