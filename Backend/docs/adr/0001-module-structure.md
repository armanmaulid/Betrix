# ADR 0001 — Module Structure: DDD-lite + Clean Architecture per Module

> **Status:** Accepted (Fase 1, 2026-08-28)
> **Deciders:** Solo dev (Betrix)
> **Context:** Refactoring Fase 1 — konsolidasi struktur codebase ke bounded contexts

## Context

Codebase Betrix Backend saat ini (pre-Fase-1) memiliki **dua gaya struktur yang inkonsisten**:

1. **Vertical-slice style** di `application/use-cases/{auth,chat,admin,market,user}/` — use case file per concern, tapi dipisah-pisah folder tanpa domain/application/infrastructure separation
2. **Bounded context style** di `contexts/news/{domain,application,infrastructure}/` — sudah ada layered structure tapi tidak konsisten dengan yang lain

Kondisi ini menyebabkan:
- Tidak jelas di mana taruh file baru (some in `application/use-cases/`, some in `contexts/<m>/`)
- Cross-module import tidak ter-enforce (siapa saja bisa import dari mana saja)
- `application/services/` campur (AuthService, CalendarService, CaptchaService, MarketDataService, SymbolService, TradeAnalysisContextService) — tidak ada batasan modul
- Tidak ada IOC pattern (dependency registration tersebar)

## Decision

Adopsi **DDD-lite + Clean Architecture per Module** dengan struktur sebagai berikut:

```
src/modules/<context>/
├── domain/                  # Pure business logic — zero external deps
│   ├── entities/            # Aggregate roots, entities
│   ├── value-objects/       # Value objects (Email, Money, etc.)
│   ├── events/              # Domain events (UserRegistered, MessageSent, etc.)
│   └── ports/               # Interfaces (input: use case ports; output: repo + external ports)
│
├── application/             # Use case orchestration
│   ├── use-cases/           # 1 file = 1 use case (LoginUseCase.ts, SendMessageUseCase.ts)
│   ├── services/            # Cross-use-case logic (khusus module ini)
│   ├── mappers/             # Domain → DTO mapping
│   ├── dto/                 # Input/output DTOs (validated by zod)
│   └── event-handlers/      # Handle events dari module lain (subscribers)
│
├── infrastructure/          # Adapters (concrete implementations)
│   ├── persistence/         # Pg<Name>Repository, Neon<Name>Repository
│   ├── external/            # SMTP, OAuth, AI, MT5 adapters
│   └── cache/               # Module-specific cache adapters
│
├── presentation/            # Delivery layer
│   ├── http/
│   │   ├── controllers/     # Request handlers (Express/Fastify)
│   │   ├── routes/          # Route definitions + zod schemas
│   │   └── middlewares/     # Module-scoped middlewares
│   ├── ws/                  # WebSocket handlers (if any)
│   └── sse/                 # SSE handlers (if any)
│
├── ioc/                     # tsyringe registration
│   └── register.ts          # registerIamContainer(container)
│
├── tests/                   # Integration tests
│
├── <context>.module.ts      # Barrel export (public API only)
└── README.md                # Module-specific docs (optional)
```

### Bounded Contexts yang akan dibuat (7)

| Module | Sumber migrasi |
|---|---|
| `iam` | `application/use-cases/auth/*` + `application/use-cases/user/*` + `application/services/AuthService.ts` + `domain/repositories/{User,Session,UserDevice,EmailVerification,...}Repository.ts` |
| `chat` | `application/use-cases/chat/*` + `application/services/ChatService.ts` (?) + `domain/repositories/ChatRepository.ts` |
| `market` | `application/use-cases/market/*` + `application/services/{MarketDataService,SymbolService,CalendarService}.ts` + `domain/repositories/{MarketData,Symbol,Calendar}Repository.ts` |
| `admin` | `application/use-cases/admin/*` + `application/services/` (admin-specific) + `domain/repositories/{ActivityLog,AdminAction,Analytics,...}Repository.ts` |
| `messaging` | `application/use-cases/user/*` (yang terkait message/notification) + `domain/repositories/{Message,Notification}Repository.ts` |
| `news` | `contexts/news/*` (rename + tambah `presentation/`, `events/`, `ioc/`, `<name>.module.ts`) |
| `notification` | `infrastructure/sse/SseNotifier.ts` (infra-only, port-based) |

### Barrel Export Convention (PUBLIC API)

Setiap module punya **satu file barrel**: `src/modules/<context>/<context>.module.ts`

```ts
// modules/iam/iam.module.ts
export * from './application/use-cases/LoginUseCase.js';
export * from './application/use-cases/RegisterUseCase.js';
// ... only public use cases

export { registerIamContainer } from './ioc/register.js';
export { iamRouter } from './presentation/http/routes/index.js';

export type { User } from './domain/entities/User.js';
export type { UserLoggedIn, UserRegistered } from './domain/events/index.js';
```

**Rules:**
- ❌ `application/use-cases/*` TIDAK BOLEH di-import langsung dari module lain
- ❌ `domain/*` TIDAK BOLEH di-import langsung dari module lain
- ✅ Hanya `<context>.module.ts` barrel yang boleh di-import oleh module lain atau composition root
- ✅ Cross-module communication via **in-process event bus** (Fase 2)

### Dependency Rules (enforced by `dependency-cruiser.config.cjs`)

| From | To | Allowed? |
|---|---|---|
| `domain/` | `application/`, `infrastructure/`, `presentation/`, `interfaces/`, other modules | ❌ |
| `application/` | `presentation/`, `interfaces/`, other modules' internals | ❌ |
| `infrastructure/` | `application/`, `presentation/`, other modules' domain | ❌ |
| `domain/` of module A | `domain/` of module B | ❌ (use barrel or event) |
| Any module's internal | Other module's internal | ❌ (use barrel or event) |
| `<context>.module.ts` | Anywhere in same module | ✅ |
| `shared/` | `modules/`, `infrastructure/` | ❌ |
| `infrastructure/persistence/providers/*` (cross-cutting) | `domain/ports/*` (read interface) | ✅ |

## Consequences

### Positive
- **Clear separation** — developer tahu persis di mana taruh file baru
- **Module isolation** — ganti module A tidak affect module B (kalau contract dijaga)
- **Testable in isolation** — bisa unit test domain tanpa container
- **Service extraction ready** — kalau perlu extract 1 module ke service terpisah, sudah ada boundary jelas
- **Multiple frontends** — bisa buat BFF per client (web, mobile, admin) tanpa ubah module

### Negative
- **Boilerplate** — 1 use case = minimal 3 file (port interface, impl, test). Untuk tim kecil, bisa terasa berlebihan.
- **Learning curve** — developer baru perlu paham hexagonal + bounded context
- **Overhead migrasi** — 30+ files di-rename, ratusan import path di-update. Effort 3-5 hari untuk solo dev.
- **Strict enforcement** — kalau arch-test terlalu ketat, bisa false positive (e.g. `EventDispatcher` di `domain/` import logger infra)

### Mitigation
- **Gradual enforcement** — Fase 1 migrate struktur dulu, hexagonal enforcement strict di Fase 2
- **Allowlist files** untuk false positive (e.g. `core/events/EventDispatcher.ts` boleh import logger untuk sekarang, di-fix di Fase 2)
- **Per-module pilot** — kerjakan `iam` dulu (paling kompleks), kalau pattern OK, copy ke module lain

## Alternatives Considered

### Alternative 1: Pure Microservices
- ❌ Overkill untuk 1 dev, 7 modul. Microservices butuh DevOps mature.
- ✅ Cocok kalau ada bukti kebutuhan (Fase 8)

### Alternative 2: Pure Modular Monolith (no layered per module)
- ❌ Domain masih bisa import infrastructure (no enforcement)
- ❌ Lebih cepat tapi less safe

### Alternative 3: Vertical Slice Architecture (VSA)
- ❌ Cocok untuk tim baru, less structure
- ❌ Tidak fit dengan codebase existing yang sudah punya domain layer

### Alternative 4: NestJS-style Modules
- ❌ Overhead besar, opinionated
- ❌ Migration cost tinggi (perlu rewrite banyak code)

## References

- Sam Newman, *Building Microservices* 2nd Ed. — "Modular Monolith" chapter
- Martin Fowler — "MonolithFirst"
- Shopify Engineering — "The Modular Monolith: Rails Architecture at Shopify"
- Alistair Cockburn — "Hexagonal Architecture (Ports & Adapters)"
- Vaughn Vernon — "Implementing Domain-Driven Design"
- [`refactoring-plan-2026.md`](../refactoring-plan-2026.md) Section 2 (Target Struktur Direktori)
