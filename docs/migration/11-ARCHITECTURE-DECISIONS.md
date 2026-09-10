# Betrix Migration — Architecture Decision Record

## ADR-001 — NestJS + Fastify
Decision: use NestJS as application framework and Fastify as HTTP adapter.

Reason: module/DI/lifecycle primitives reduce custom infrastructure while retaining high-performance HTTP runtime.

Constraint: domain/application code must not depend on HTTP framework.

## ADR-002 — URI API Versioning
Decision: `/api/v1` and future `/api/v2` URI versioning.

Reason: explicit, observable, client-friendly breaking-change boundary.

Constraint: version controllers/DTOs/mappers, not domain model.

## ADR-003 — Better Auth as Auth Authority
Decision: Better Auth owns identity/session primitives.

Reason: eliminate duplicated custom session/password/OAuth infrastructure.

Constraint: Betrix-specific device, CAPTCHA, rate-limit and audit policies remain where required.

## ADR-004 — Drizzle + PostgreSQL
Decision: Drizzle ORM over PostgreSQL.

Reason: typed SQL/ORM with direct PostgreSQL semantics and explicit migration workflow.

Constraint: no generic repository abstraction whose only purpose is to hide Drizzle.

## ADR-005 — Database-Driven LLM Registry
Decision: model/provider/task assignment and pricing live in DB.

Reason: admin changes should not require deploys.

Constraint: provider secrets stay in secret management; historical prices are immutable/versioned.

## ADR-006 — Token-Based Billing
Decision: charge based on normalized actual token usage and versioned model price.

Reason: aligns cost/charge with real LLM consumption and enables audit/reconciliation.

Constraint: reservation is required when final usage is not known before provider call.

## ADR-007 — Fixed-Point Credits
Decision: use integer microcredits (or another documented integer unit).

Reason: deterministic arithmetic and no floating-point rounding drift.

## ADR-008 — BullMQ for Distributed Background Work
Decision: use BullMQ/Redis for distributed scheduled/queued work.

Reason: `setInterval` inside multiple API processes can duplicate work.

Constraint: long-lived MT5 connection remains a dedicated infrastructure lifecycle component, not a queue job.

## ADR-009 — SSE Preservation
Decision: preserve SSE for existing streaming contracts.

Reason: changing transport is unnecessary migration scope.

Constraint: move HTTP lifecycle plumbing into Nest while keeping application streaming semantics.

## ADR-010 — Structured Logging
Decision: use structured request/application logging, preferably Pino with Fastify if compatible with project needs.

Reason: correlation, observability and lower custom logging overhead.

Constraint: secrets and sensitive prompt/auth data must be redacted.

## ADR-011 — Preserve Domain/Application Logic
Decision: migrate framework/infrastructure boundaries before rewriting business rules.

Reason: existing repository already follows Clean Architecture/DDD-ish separation and contains useful business logic.

Constraint: simplify only when behavior remains covered by tests.
