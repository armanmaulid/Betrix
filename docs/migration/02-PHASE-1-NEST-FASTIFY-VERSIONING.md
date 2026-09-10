# Phase 1 — NestJS + Fastify Foundation + API Versioning

## Objective
Introduce NestJS without rewriting domain behavior. Establish `/api/v1` as the stable HTTP boundary from the first migrated endpoint.

## Target stack
- NestJS 12.x stable
- `@nestjs/platform-fastify` matching Nest major
- Fastify 5.x stable
- TypeScript version compatible with the selected Nest release
- Keep dependencies minimal; do not add libraries merely because they are popular.

Do not use Fastify 6 alpha or other prerelease infrastructure for production migration.

## Target bootstrap
`main.ts` should bootstrap Nest. `AppModule` should own module composition. Fastify adapter should be configured centrally.

Recommended global concerns:
- ConfigModule
- validation pipe
- exception filter
- request/correlation ID
- security headers
- CORS
- structured request logging
- API versioning
- OpenAPI

## API versioning policy
Primary mechanism: URI versioning.

Examples:
- `/api/v1/auth/...`
- `/api/v1/chat/...`
- `/api/v1/market/...`
- `/api/v2/chat/...`

Rules:
1. Backward-compatible additions stay in the current version.
2. Breaking request/response/auth semantics require a new version.
3. Version at controller/DTO/mapper boundary, not in domain entities or core application services.
4. Do not create `ChatServiceV1`/`ChatServiceV2` unless behavior genuinely differs at application level.
5. Prefer separate V1/V2 controllers and DTOs that call shared application services.
6. Database schema is canonical; never create `users_v1`/`users_v2` for API versioning.
7. Admin APIs are versioned too.
8. Keep a documented deprecation/sunset window for old versions.

Recommended structure:
```text
src/modules/chat/
  application/
  domain/
  infrastructure/
  presentation/
    v1/
      chat.controller.ts
      dto/
      mappers/
    v2/
      chat.controller.ts
      dto/
      mappers/
```

## Migration strategy
Do not convert every controller in one commit.

1. Create Nest shell.
2. Keep legacy code reachable where needed.
3. Select one low-risk endpoint as vertical slice.
4. Implement `/api/v1` equivalent.
5. Compare old/new responses with characterization tests.
6. Route traffic only after parity.
7. Continue vertical slices.
8. Delete legacy routing only after all consumers migrate.

## HTTP concerns
Replace Express-specific constructs with Nest/Fastify abstractions:
- `Request`/`Response` → decorators and DTOs.
- `next(err)` → thrown exceptions + global filter.
- manual route registration → controllers/modules.
- custom validation middleware → pipes.
- auth middleware → guards.
- cross-cutting response/request behavior → interceptors.

Use raw Fastify request/reply only at infrastructure edges where unavoidable.

## SSE
Preserve SSE for existing streaming contracts. Move header/lifecycle/error handling out of hand-written Express controller logic. Business streaming remains an application concern.

Do not convert external MT5 WebSocket to Nest Gateway simply for framework consistency.

## Acceptance criteria
- [ ] Nest app boots with Fastify.
- [ ] `/health` and readiness behavior are defined.
- [ ] `/api/v1` versioning works.
- [ ] Global validation/error handling works.
- [ ] Request ID/correlation ID survives through logs.
- [ ] CORS/security behavior is covered by tests.
- [ ] One real endpoint is migrated and parity-tested.
- [ ] OpenAPI documents the migrated version.
- [ ] Legacy Express remains available only where migration still needs it.
