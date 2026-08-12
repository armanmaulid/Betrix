# Betrix Backend

A high-performance, cleanly-architected, and future-proof backend for the Betrix financial trading platform. 
Engineered with **Domain-Driven Design (DDD)** and **Clean Architecture**, this system provides robust AI orchestration, real-time market data (via MT5 Bridge), and comprehensive user management.

Built with **TypeScript (ES2022, ESM)**, **Node.js**, **PostgreSQL**, and **Redis**.

---

## 🏗️ Architecture Overview

Our codebase rigorously enforces Clean Architecture boundaries to ensure high testability, maintainability, and scalability. The dependency rule points *inwards*—inner layers have absolutely zero knowledge of outer layers.

```text
src/
├── domain/                 # 🟢 The Core: Pure business logic (Zero framework/infra dependencies)
│   ├── entities/          # Business objects (User, Session, ChatMessage, NewsArticle, etc.)
│   ├── repositories/      # Interfaces (Ports) for data access (AnalyticsRepository, etc.)
│   ├── services/          # Pure domain logic (MarketDataService, AiPromptRegistry, etc.)
│   └── events/            # Domain events (ChatCompleted, EventDispatcher, etc.)
│
├── application/            # 🟡 The Orchestrator: Application-specific business rules
│   ├── use-cases/         # Grouped by feature (auth, admin, chat, market, news)
│   ├── ports/             # Interfaces for external integrations (IBrokerProvider, INotifier)
│   ├── dtos/              # Zod schemas for input validation
│   └── event-handlers/    # Listeners reacting to domain events (e.g., ChatLoggingHandler)
│
├── data/                   # 🔴 The Infrastructure (Data): Database and Cache Adapters
│   ├── repositories/      # Concrete implementations of Domain Repositories (Pg*, Redis*)
│   ├── orm/               # Raw Database Clients (pgClient, redisClient)
│   ├── cache/             # GeneralCacheStore (In-memory caching)
│   └── external/          # Concrete APIs (FinnhubClient, AiGatewayClient, MT5 Adapters)
│
├── presentation/           # 🔵 The Delivery: HTTP / Express Layer
│   ├── controllers/       # Thin HTTP adapters translating requests to Use Cases
│   ├── routes/            # Express router definitions (v1)
│   └── middleware/        # auth, admin, credits, error handling, rate limiters
│
├── infrastructure/         # 🟣 The Infrastructure (System): External frameworks
│   └── sse/               # Server-Sent Events implementation (SseNotifier)
│
├── core/                   # ⚙️ Shared Kernel: Cross-cutting utilities
│   ├── errors/            # Typed Application Errors (AppError, ValidationError, etc.)
│   ├── logging/           # Winston logger with request ID tracking
│   └── utils/             # Cryptography, hashing, parsers, and utilities
│
└── bootstrap/              # 🚀 Application Entry & Wiring
    ├── container.ts       # TSyringe Dependency Injection registration
    └── startServer.ts     # Express initialization and background jobs
```

---

## ⚡ Tech Stack & Modern Tooling

- **Runtime & Language**: Node.js 20+ with TypeScript (ESM, Target: ES2022). Execution via `tsx` for blazing-fast cold starts and hot-reloads.
- **Framework**: Express.js (Modularized & RESTful).
- **Dependency Injection**: `tsyringe` (Microsoft's modern IoC container).
- **Validation**: `zod` for end-to-end type-safe payload validation.
- **Testing**: `vitest` (Vite-powered, lightning-fast replacement for Jest).
- **Linting**: ESLint v9 (Flat Config) + Prettier.
- **Database**: PostgreSQL (`pg` native, optimized for extreme concurrency without ORM bloat).
- **Caching & KV**: Upstash Redis (`@upstash/redis` for serverless-ready connections).

---

## 🔥 Key Features

| Feature | Description |
|---------|-------------|
| **AI Chat Orchestration** | Intelligent routing by task type (Cheap/Balanced/Deep), streaming responses, token usage tracking, and automated credit billing with atomic rollbacks. |
| **Credit Economy** | Pre-deduction mechanics with tier-based pricing (1, 3, or 5 credits). Refunds guaranteed on downstream AI failures. |
| **Real-time Market Data** | Zero-latency integrations with MT5 Bridge via WebSockets. Serves tick prices, OHLC charts, and Market Book (DOM). |
| **Device Fingerprinting** | Advanced 1-device-per-account enforcement mapping IPs, User-Agents, and OS heuristics. |
| **Robust Security** | Helmet, IP+User rate limiting, input sanitization, and SHA-256 hashed session token persistence. |
| **Event-Driven Audit** | Fully decoupled architecture logging every admin action, user activity, and chat metric asynchronously via EventDispatcher. |

---

## 📡 API Endpoints (v1)

*Base path: `/api/v1`*

| Domain | Key Endpoints |
|--------|---------------|
| **Auth** | `POST /auth/login`, `POST /auth/register`, `PUT /auth/password`, `DELETE /auth/sessions/:fingerprint` |
| **Chat** | `POST /chat`, `POST /chat/stream`, `GET /chat/history`, `DELETE /chat/session/:id` |
| **Market** | `GET /market/prices/all`, `GET /market/ohlc/:symbol/:tf`, `GET /market/calendar`, `GET /market/symbols` |
| **User** | `GET /me/usage`, `GET /me/messages`, `POST /me/messages`, `GET /me/messages/preferences` |
| **Admin** | `GET /admin/users`, `GET /admin/metrics`, `GET /admin/system`, `POST /admin/broadcast`, `GET /admin/analytics` |
| **Health** | `GET /health` (Deep check: tests PG & Redis connections) |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis Server (or Upstash Redis)

### 1. Installation
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env`. Critical variables:
```env
# Database & Cache
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# AI Gateway
AI_BASE_URL=https://gateway.example.com/v1
AI_API_KEY=xxx

# MT5 Integration
MT5_WS_URL=ws://127.0.0.1:8890
MT5_HTTP_URL=http://127.0.0.1:8890
```

### 3. Database Migration
```bash
npm run migrate
```

### 4. Development & Testing
```bash
npm run dev          # Start with hot-reload (tsx)
npm run build        # Compile TypeScript to dist/
npm run start        # Run compiled production build
npm run test         # Run unit & integration tests via Vitest
npm run lint:fix     # Auto-fix linting issues
```

---

## 🕰️ Background Jobs & Schedulers

| Job Name | Schedule | Action |
|----------|----------|--------|
| **Garbage Collection** | Hourly | Purges expired sessions, dead verify tokens, old news, and clears obsolete cache arrays. |
| **Symbol Sync** | Daily (02:00) | Pulls and updates master tradable symbols from MT5. |
| **Calendar Sync** | Daily (03:00) | Hydrates the Economic Calendar repository. |
| **News Polling** | Every 10s | Polls Finnhub for the latest breaking market news. |

*Note: Heavy syncs run completely non-blocking during startup, allowing the Express server to instantly bind to the port.*

---

## 🧠 Architectural Decisions (ADR)

1. **Why Raw PostgreSQL instead of Prisma/TypeORM?**
   Betrix requires processing thousands of tick updates and bulk inserts per second. Heavy ORMs introduce lifecycle overhead and memory spikes. By using raw parameterized queries wrapped inside Clean Architecture Repositories, we achieve maximum C-level database performance while keeping the domain layer entirely uncoupled from SQL syntax.

2. **Why Tsyringe?**
   Dependency Injection is the backbone of Clean Architecture. Passing 10 repositories manually through constructors is unmaintainable. Tsyringe allows us to resolve the `NewsController` which automatically injects `GetNewsUseCase`, which recursively injects `NewsRepository`, enabling effortless mocking during testing.

3. **Event-Driven Side Effects**
   Chat usage tracking, metrics logging, and user activity logging are NOT awaited inline within the chat use-case. They are dispatched as domain events (`ChatCompleted`) and handled asynchronously by `ChatLoggingHandler`. This reduces API latency for the end-user by 30-50ms.

---
*Built with precision for Betrix.*