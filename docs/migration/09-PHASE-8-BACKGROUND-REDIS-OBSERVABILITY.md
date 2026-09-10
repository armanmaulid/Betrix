# Phase 8 — Background Jobs, Redis, MT5 and Observability

## Objective
Make background execution safe for horizontal scaling and move process lifecycle management into Nest while preserving specialized integrations.

## Background jobs
Current jobs use startup execution and intervals for MT5/Finnhub/cleanup/news behavior.

Classify every job from Phase 0:
- one-shot startup task
- periodic distributed job
- queue worker job
- event-driven job
- long-lived connection

Use BullMQ + Redis for work that must be coordinated across multiple application instances.

Do not use `setInterval` for distributed singleton work.

## MT5
MT5 external WebSocket connection is not a queue job. Keep it as infrastructure managed through Nest lifecycle hooks (`OnModuleInit`/`OnModuleDestroy`) or an equivalent dedicated manager.

Requirements:
- reconnect policy
- shutdown cleanup
- no duplicate connection per API instance unless intentionally designed
- health state visible to readiness/metrics

## Redis
Retain Redis for use cases supported by its strengths:
- cache
- rate limits
- CAPTCHA state
- distributed locks
- BullMQ
- market/news cache
- stream tickets or ephemeral state if required

Do not retain the custom Redis session repository merely because it already exists. Better Auth is the auth/session authority after Phase 3.

Inventory and preserve key names/TTL semantics during migration.

## Logging
Fastify is well suited to structured logging. Prefer a structured logger such as Pino if it reduces custom logging infrastructure.

Every important request should support:
- request ID
- correlation/trace ID
- route
- method
- status
- latency
- authenticated user ID where safe

LLM/billing logs should additionally support:
- model
- task type
- provider
- token usage
- credits charged
- request/reference ID

Never log secrets, auth tokens, provider API keys or sensitive prompt data unless an explicit safe redaction policy permits it.

## Health
Define:
- liveness: process is alive
- readiness: dependencies required for serving traffic are ready
- dependency health: DB/Redis/critical provider/MT5 status as appropriate

Do not make liveness fail merely because a noncritical dependency is unavailable.

## Graceful shutdown
Shutdown order must be explicit:
1. stop accepting new traffic;
2. stop new job intake;
3. allow in-flight requests/settlements to finish or timeout safely;
4. stop workers;
5. close long-lived integrations;
6. close DB/Redis;
7. exit.

## Acceptance criteria
- [ ] Distributed periodic jobs are safe across multiple instances.
- [ ] BullMQ workers are operationally observable.
- [ ] MT5 lifecycle is clean.
- [ ] Redis keys/TTL semantics are documented.
- [ ] Structured logs include correlation data.
- [ ] Secrets are redacted.
- [ ] Liveness/readiness are distinct.
- [ ] Graceful shutdown is tested.
