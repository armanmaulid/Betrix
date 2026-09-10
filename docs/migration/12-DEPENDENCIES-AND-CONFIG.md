# Dependency and Configuration Migration Matrix

## Target dependencies

Use latest stable releases at execution time, but keep the whole Nest/Fastify ecosystem on compatible major versions.

Known stable baseline checked during planning:
- NestJS 12.x
- `@nestjs/platform-fastify` 12.x
- Fastify 5.x stable
- Better Auth 1.7.x line
- Drizzle ORM 0.45.x stable line

Do not select prerelease Fastify 6 or Drizzle 1.0 RC solely because the version is numerically newer.

Re-check package registry at implementation time and record exact versions in the lockfile.

## Remove eventually
- express
- passport / passport-google-oauth20 if Better Auth fully replaces their usage
- tsyringe
- express-rate-limit if replaced by an appropriate Fastify/Nest/Redis solution
- custom middleware packages that no longer have consumers
- custom session dependencies after auth cutover
- custom migration tooling after Drizzle migration cutover

Only remove after source search confirms no active references.

## Evaluate / keep as needed
- zod: can remain if domain/application schemas use it; integrate through Nest pipes/adapters rather than custom Express middleware.
- bcryptjs: remove if no longer needed after Better Auth migration; verify Better Auth password handling and any legacy migration needs first.
- `pg`: may remain as Drizzle's PostgreSQL driver dependency depending on chosen driver; do not remove blindly.
- Redis client: retain for cache/queue/rate limit/coordination needs.
- WebSocket dependency: retain if MT5 integration still requires it.

## Configuration migration
Current model configuration includes env variables for model names and max tokens. During Phase 4, these become bootstrap/migration defaults only, not runtime authority.

New configuration categories:
- application
- database
- redis
- auth
- CORS/security
- LLM provider credentials/references
- queue
- observability
- external MT5/Finnhub/mail services

Secrets:
- never commit
- never log
- never store plaintext provider secrets in LLM model rows

## Environment compatibility
Keep legacy env names temporarily if rollback requires them. Mark them deprecated and stop reading them in the new runtime after DB registry cutover.

Acceptance:
- [ ] exact package versions recorded
- [ ] no prerelease infrastructure selected unintentionally
- [ ] lockfile is reproducible
- [ ] env migration documented
- [ ] secret handling audited
