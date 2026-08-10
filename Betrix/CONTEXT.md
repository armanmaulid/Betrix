# Backend Context - Betrix Forex Trading Platform

> **Branch:** `session/agent_6362b899-f379-4a56-ba9c-953753659e53`  
> **Last Updated:** 2026-08-10  
> **Status:** ✅ Restructured & Type-Safe

---

## 🎯 Overview

Complete backend restructuring from monolithic JavaScript to **Clean Architecture with TypeScript**. The backend now provides a type-safe, scalable API for the Betrix forex trading platform with AI orchestration, credit-based billing, and real-time market data.

---

## 🏗️ Architecture (Clean Architecture)

```
src-new/
├── config/                 # Zod-validated env, AI models, Passport, device enforcement
├── core/                   # Cross-cutting: errors, logging, middleware, utils, constants
├── domain/                 # Pure business logic (ZERO framework deps)
│   ├── entities/           # User, Session, ChatMessage, CreditTransaction, Device, AdminAction, Message, NewsArticle, BrokerSymbol, CalendarEvent
│   ├── repositories/       # Repository interfaces (ports)
│   ├── services/           # Domain services (Auth, Credit, Device, Chat, etc.)
│   ├── events/             # Domain events (UserRegistered, CreditsDeducted, etc.)
│   └── value-objects/      # Email, DeviceFingerprint, SessionToken
├── data/                   # Infrastructure implementations
│   ├── repositories/       # PostgreSQL & Redis implementations
│   ├── orm/                # pgClient, redisClient, migrate.ts
│   ├── external/           # AiGatewayClient, EmailService, FinnhubClient, Mt5Client
│   └── cache/              # GeneralCacheStore (in-memory)
├── application/            # Use cases (orchestration layer)
│   ├── dtos/               # Zod schemas for request validation
│   ├── use-cases/          # 30+ use cases (Auth, Chat, Admin, User, Market)
│   └── ports/              # Output ports (EmailPort, AiPort, CachePort)
├── presentation/           # HTTP layer
│   ├── routes/v1/          # API routes (auth, chat, admin, user, market, health)
│   ├── middleware/         # auth, admin, credits, validate
│   └── controllers/        # Thin adapters: HTTP → UseCase
├── bootstrap/              # DI container, server startup
├── background/             # Scheduled jobs (cleanup, sync, news polling)
└── main.ts                 # Entry point
```

---

## 🔑 Key Features

| Feature | Implementation |
|---------|----------------|
| **Auth** | JWT + Google OAuth, device fingerprinting, email verification, session management |
| **AI Chat** | Model routing by task type (cheap/balanced/deep), streaming, credit billing with refunds |
| **Credits** | Pre-deduction, refund on failure, tier-based pricing (1/3/5 credits) |
| **Device Enforcement** | Optional one-device-per-account via fingerprint (IP + UA + browser + OS) |
| **Admin** | User management, analytics, audit logs, broadcast messaging |
| **Market Data** | MT5 symbols, economic calendar, Finnhub news |
| **Security** | Helmet, CORS, rate limiting (IP + per-user), input sanitization |

---

## 📡 API Endpoints (v1)

All endpoints prefixed with `/api/v1`

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | ❌ | Register new user |
| POST | `/auth/login` | ❌ | Login |
| POST | `/auth/logout` | ✅ | Logout |
| GET | `/auth/verify-email` | ❌ | Verify email token |
| POST | `/auth/resend-verification` | ❌ | Resend verification |
| PUT | `/auth/password` | ✅ | Change password |
| PUT | `/auth/email` | ✅ | Change email |
| GET | `/auth/me` | ✅ | Get profile |
| PUT | `/auth/profile` | ✅ | Update profile |
| GET | `/auth/sessions` | ✅ | List sessions |
| DELETE | `/auth/sessions/:fingerprint` | ✅ | Revoke session |

### Chat (AI)
| Method | Endpoint | Auth | Credits | Description |
|--------|----------|------|---------|-------------|
| POST | `/chat` | ✅ | 1/3/5 | Send message (non-stream) |
| POST | `/chat/stream` | ✅ | 1/3/5 | Stream response (SSE) |
| GET | `/chat/history` | ✅ | - | Paginated history |
| DELETE | `/chat/session/:id` | ✅ | - | Delete session |
| GET | `/chat/export` | ✅ | - | Export JSON/CSV |

### Admin
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/admin/users` | Admin | List users with filters |
| GET | `/admin/users/:id` | Admin | User detail + stats |
| PUT | `/admin/users/:id` | Admin | Update status/role |
| DELETE | `/admin/users/:id` | Admin | Delete user |
| POST | `/admin/users/:id/reset-password` | Admin | Reset password |
| GET | `/admin/metrics` | Admin | Platform metrics |
| GET | `/admin/analytics` | Admin | Analytics charts |
| GET | `/admin/system` | Admin | System info |
| GET | `/admin/actions` | Admin | Audit logs |
| POST | `/admin/broadcast` | Admin | Send broadcast message |

### User
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/me/usage` | ✅ | Token usage stats |
| GET | `/me/messages` | ✅ | Inbox messages |
| POST | `/me/messages` | ✅ | Send message |
| GET/POST | `/me/messages/preferences` | ✅ | Notification prefs |

### Market
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/market/symbols` | ✅ | Trading symbols |
| GET | `/market/calendar` | ✅ | Economic calendar |

### Health
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | ❌ | Basic health |
| GET | `/api/v1/health` | ❌ | Detailed (DB, Redis) |

---

## 💳 Credit System

| Tier | Models | Cost/Request | Use Case |
|------|--------|--------------|----------|
| **Cheap** | General, Classify | 1 credit | Quick questions, categorization |
| **Balanced** | Summary, Insight | 3 credits | Market analysis, summaries |
| **Deep** | Trade Reasoning, Risk Narrative | 5 credits | Deep analysis, risk assessment |

- Credits deducted **before** AI call
- **Auto-refund** on AI failure
- Admin can grant/deduct credits

---

## 🗄️ Database Schema (15 Tables)

| Table | Purpose |
|-------|---------|
| `users` | User accounts, auth, credits, status |
| `sessions` | Auth sessions with device binding |
| `chat_logs` | AI chat history |
| `token_usage` | AI token tracking |
| `credit_transactions` | Credit ledger |
| `user_devices` | Device fingerprint binding |
| `admin_actions` | Audit log |
| `user_activity_logs` | Activity tracking |
| `messages` | Internal messaging |
| `message_notification_preferences` | Email prefs |
| `email_verifications` | Verification tokens |
| `failed_login_attempts` | Brute force protection |
| `news_articles` | Financial news cache |
| `broker_symbols` | MT5 trading symbols |
| `calendar_events` | Economic calendar |

---

## 🚀 Quick Start

```bash
# 1. Clone & checkout
git clone <repo-url>
cd Betrix
git checkout session/agent_6362b899-f379-4a56-ba9c-953753659e53

# 2. Install
cd Backend
npm install

# 3. Configure
cp .env.example .env
# Edit .env with real values (DATABASE_URL, JWT_SECRET, etc.)

# 3. Database
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=betrix postgres:15
# Update .env: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/betrix

# 4. Migrate
npm run build
node dist/data/orm/migrate.js

# 5. Start
npm run dev          # Port 5000 (tsx watch)
# or
npm run start        # Compiled (port 5000)
```

---

## 🔧 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `UPSTASH_REDIS_REST_URL` | ✅ | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Upstash Redis token |
| `JWT_SECRET` | ✅ | 32+ char secret |
| `AI_BASE_URL` | ✅ | AI Gateway URL |
| `AI_API_KEY` | ✅ | AI Gateway API key |
| `MODEL_CHEAP` | ✅ | Model name for cheap tier |
| `MODEL_BALANCED` | ✅ | Model name for balanced tier |
| `MODEL_DEEP` | ✅ | Model name for deep tier |
| `SMTP_HOST/PORT/USER/PASS` | ✅ | Email SMTP config |
| `FINNHUB_API_KEY` | ❌ | Finnhub for news |
| `MT5_BRIDGE_URL` | ❌ | MT5 WebSocket/REST |
| `DEVICE_ENFORCEMENT` | ❌ | `true`/`false` (default: false) |

---

## 📝 Frontend Integration Notes

### Auth Flow
```typescript
// 1. Register
POST /api/v1/auth/register { email, password, name }
// Returns: { sessionToken, user? }

// 2. Login
POST /api/v1/auth/login { email, password }
// Returns: { sessionToken, user }

// 3. Use token
Authorization: Bearer <sessionToken>

// 4. Protected routes return 401 if invalid/expired
```

### Chat Streaming (SSE)
```typescript
const response = await fetch('/api/v1/chat/stream', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, taskType: 'trade_reasoning', history, tier: 'deep' })
});

const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = new TextDecoder().decode(value);
  // Parse SSE: "data: {...}\n\nevent: done\ndata: {...}\n\n"
}
```

### Error Handling
All errors follow this format:
```json
{
  "error": "Human readable message",
  "code": "ERROR_CODE",
  "details": {},
  "requestId": "uuid"
}
```

Common codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INSUFFICIENT_CREDITS`, `RATE_LIMITED`, `INTERNAL_ERROR`

---

## 🧪 Testing

```bash
npm run test           # Run all tests (Vitest)
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
npm run lint           # ESLint
npm run lint:fix       # Auto-fix
```

---

## 📦 Deployment

```bash
# Build
npm run build

# Start production
npm run start          # Runs on PORT (default 5000)

# Docker
docker build -t betrix-backend .
docker run -p 5000:5000 --env-file .env betrix-backend
```

---

## 👥 Team Contacts

- **Backend:** This branch (`session/agent_6362b899-f379-4a56-ba9c-953753659e53`)
- **Frontend:** Consume `/api/v1/*` endpoints
- **DevOps:** PostgreSQL 15+, Upstash Redis, Node 20+

---

## 📋 Migration Checklist for Frontend

- [ ] Update API base URL to `/api/v1`
- [ ] Implement SSE for chat streaming
- [ ] Handle credit errors (402) with upgrade prompt
- [ ] Add Authorization header interceptor
- [ ] Implement device fingerprinting for `DEVICE_ENFORCEMENT=true`
- [ ] Update error handling for new error codes
- [ ] Test admin panel with new analytics endpoints

---

*Generated from branch `session/agent_6362b899-f379-4a56-ba9c-953753659e53` - Clean Architecture TypeScript restructuring complete.*