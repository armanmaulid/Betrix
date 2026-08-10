# Betrix Backend - Restructured Architecture

A clean, type-safe backend for the Betrix forex trading platform with AI orchestration, built with TypeScript, Express, PostgreSQL, and Redis.

## Architecture Overview

```
src-new/
├── config/                 # Configuration & env validation (Zod)
│   ├── env.ts             # Validated environment schema
│   ├── models.ts          # AI model configuration
│   ├── deviceEnforcement.ts
│   └── passport.ts        # Google OAuth strategy
├── core/                   # Cross-cutting concerns (no domain deps)
│   ├── errors/            # Typed error classes (AppError, ValidationError, etc.)
│   ├── logging/           # Winston logger with request ID tracking
│   ├── middleware/        # errorHandler, requestId, rateLimiter, sanitize
│   ├── utils/             # crypto, deviceFingerprint, csv, date, chat, request
│   └── constants/         # HTTP status, error codes, limits, task types
├── domain/                 # Pure business logic (zero framework deps)
│   ├── entities/          # User, Session, ChatMessage, CreditTransaction, Device, AdminAction, Message, NewsArticle, BrokerSymbol, CalendarEvent
│   ├── repositories/      # Repository interfaces (ports)
│   ├── services/          # Domain services (AuthDomainService, CreditDomainService, etc.)
│   ├── events/            # Domain events (UserRegistered, CreditsDeducted, etc.)
│   └── value-objects/     # Email, DeviceFingerprint, SessionToken
├── data/                   # Infrastructure implementations (adapters)
│   ├── repositories/      # PostgreSQL & Redis implementations
│   ├── orm/               # pgClient, redisClient
│   ├── external/          # AiGatewayClient, EmailService, FinnhubClient, Mt5Client
│   └── cache/             # GeneralCacheStore (in-memory)
├── application/            # Use cases (orchestration layer)
│   ├── dtos/              # Zod schemas for request validation
│   ├── use-cases/         # 30+ use cases organized by feature
│   ├── ports/             # Output ports (EmailPort, AiPort, CachePort, EventBusPort)
├── presentation/           # HTTP layer
│   ├── routes/v1/         # API routes (auth, chat, admin, user, market, health)
│   ├── middleware/        # auth, admin, credits, validate
│   ├── controllers/       # Thin adapters: HTTP → UseCase
├── bootstrap/              # App initialization
│   ├── container.ts       # tsyringe DI registration
│   ├── registerRoutes.ts
│   ├── registerMiddleware.ts
│   └── startServer.ts
├── background/             # Scheduled jobs
│   └── jobs/index.ts      # Cleanup, sync, news polling, D1 cache warmup
└── main.ts                # Entry point
```

## Key Features

- **Clean Architecture**: Strict layer separation with dependency inversion
- **Type Safety**: Full TypeScript with strict mode, Zod validation
- **Dependency Injection**: tsyringe with decorators
- **Structured Logging**: Winston with daily rotation, request IDs
- **Security**: Helmet, CORS whitelist, rate limiting (IP + per-user), input sanitization, device enforcement
- **AI Integration**: Model routing by task type, streaming, credit-based billing with refunds
- **Background Jobs**: Cron-based cleanup, symbol/calendar sync, news polling

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Upstash Redis (REST API)
- SMTP credentials for emails

### Installation

```bash
cd Backend
npm install
```

### Environment Setup

Copy `.env.example` to `.env` and configure:

```env
# Core
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174

# Database
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Auth
JWT_SECRET=your-256-bit-secret
DEVICE_ENFORCEMENT=false
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback

# AI Gateway
AI_BASE_URL=https://gateway.dahono.com/v1
AI_API_KEY=xxx
MODEL_CHEAP=model-name
MODEL_BALANCED=model-name
MODEL_DEEP=model-name

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=xxx
SMTP_PASS=xxx

# External
FINNHUB_API_KEY=xxx
MT5_BRIDGE_URL=127.0.0.1:8890
MT5_BROKER_UTC_OFFSET=3
```

### Database Migration

```bash
npm run migrate
```

### Development

```bash
npm run dev          # Hot reload with tsx
npm run build        # TypeScript compilation
npm run start        # Run compiled JS
npm run test         # Vitest tests
npm run lint         # ESLint
```

## API Endpoints (v1)

All endpoints prefixed with `/api/v1`

| Module | Endpoints |
|--------|-----------|
| **Auth** | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/verify-email`, `POST /auth/resend-verification`, `PUT /auth/password`, `PUT /auth/email`, `GET /auth/me`, `PUT /auth/profile`, `GET /auth/sessions`, `DELETE /auth/sessions/:fingerprint` |
| **Chat** | `POST /chat`, `POST /chat/stream`, `GET /chat/history`, `DELETE /chat/session/:id`, `GET /chat/export` |
| **Admin** | `GET /admin/users`, `GET /admin/users/:id`, `PUT /admin/users/:id`, `DELETE /admin/users/:id`, `POST /admin/users/:id/reset-password`, `GET /admin/metrics`, `GET /admin/analytics`, `GET /admin/system`, `GET /admin/actions`, `POST /admin/broadcast` |
| **User** | `GET /me/usage`, `GET /me/usage/current-month`, `GET /me/messages`, `POST /me/messages`, `GET/POST /me/messages/preferences` |
| **Market** | `GET /market/symbols`, `GET /market/calendar` |
| **Health** | `GET /health` |

## Credit System

| Tier | Models | Cost/Request |
|------|--------|--------------|
| Cheap | General, Classify | 1 credit |
| Balanced | Summary, Insight | 3 credits |
| Deep | Trade Reasoning, Risk Narrative | 5 credits |

Credits deducted **before** AI call, refunded on failure.

## Device Enforcement

When `DEVICE_ENFORCEMENT=true`:
- One device = one account (fingerprint: IP + UA + browser + OS)
- Registration blocks reused devices
- Login creates device-session binding
- Logout cleans up bindings

## Background Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Cleanup | Hourly | Expired sessions, failed logins, tokens, usage, old news |
| Symbol Sync | Daily 02:00 | Fetch symbols from MT5 |
| Calendar Sync | Daily 03:00 | Fetch economic calendar |
| News Polling | 10s | Finnhub news (if API key set) |
| D1 Cache Warmup | Broker midnight | Pre-fetch daily candles |

## Testing

```bash
npm run test           # Run all tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
```

## Project Structure Decisions

- **No ORM**: Raw `pg` with parameterized queries for control
- **Validation in Presentation**: Zod schemas at route level, use cases trust input
- **Shared Kernel**: `core/` has zero domain dependencies
- **Repository Pattern**: Domain defines interfaces, data implements them
- **Use Cases**: Single-responsibility, inject dependencies via constructor

## Migration from Old Structure

Old `src/` → New `src-new/` mapping:

| Old | New |
|-----|-----|
| `src/server.js` | `bootstrap/startServer.ts` + `main.ts` |
| `src/middleware/*` | `core/middleware/*` + `presentation/middleware/*` |
| `src/routes/*` | `presentation/routes/v1/*` |
| `src/services/*` | `domain/services/*` + `data/external/*` + `application/use-cases/*` |
| `src/db/*` | `data/orm/*` |
| `src/config/*` | `config/*` |
| `src/utils/*` | `core/utils/*` |

## License

MIT