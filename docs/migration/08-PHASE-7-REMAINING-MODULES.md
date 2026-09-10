# Phase 7 — Remaining HTTP Modules

## Objective
Migrate the remaining API surface to NestJS/Fastify by vertical slice, preserving contracts and removing Express-specific implementation details.

## Module boundaries
Use feature modules, not generic folders such as `ControllersModule`, `ServicesModule`, or `RepositoriesModule`.

Expected boundaries include:
- Auth
- Users/Profile
- Chat
- LLM
- Billing
- Market
- News
- Messaging/Notifications
- Analytics
- Admin

Adjust boundaries after Phase 0 inventory if source evidence shows different bounded contexts.

## Standard vertical-slice procedure
For each module:
1. inventory legacy route/controller/middleware;
2. identify application use cases and domain ports;
3. move or adapt controller into Nest;
4. replace Express request/response dependencies;
5. replace middleware with guards/pipes/interceptors/filters as appropriate;
6. wire providers through Nest DI;
7. migrate repository adapter to Drizzle where in scope;
8. add contract tests;
9. expose under `/api/v1`;
10. only then remove legacy route.

## Admin
Admin is a first-class API surface but should not become a dumping ground for domain logic.

Keep LLM configuration in LLM module, billing accounting in Billing module, analytics aggregation in Analytics module; Admin controllers orchestrate authorized operations.

Admin must expose versioned APIs for:
- users
- audit logs
- analytics/metrics
- LLM providers/models
- pricing
- usage
- billing/reconciliation
- system operations that are already present

## Authorization
Use Nest guards/policies at the presentation boundary. The actual authorization rules should be centralized and testable, not duplicated in controllers.

## Acceptance criteria
- [ ] Every active HTTP route is owned by a Nest controller.
- [ ] No active controller imports Express types.
- [ ] No active route module manually registers Express Router.
- [ ] Validation uses pipes/DTOs or a deliberate shared schema adapter.
- [ ] Authorization is explicit and tested.
- [ ] Admin APIs are versioned.
- [ ] Contract tests pass for each migrated module.
