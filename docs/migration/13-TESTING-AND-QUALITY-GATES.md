# Migration Testing Strategy and Quality Gates

## Test layers

### Unit
Cover pure/domain/application rules:
- model resolution
- pricing calculation
- rounding
- billing reservation/settlement
- authorization policies
- task routing
- usage normalization

### Integration
Cover:
- PostgreSQL/Drizzle repositories
- transactions
- Better Auth integration
- Redis
- BullMQ
- provider adapters

### Contract/API
For every `/api/v1` endpoint:
- method/path
- auth requirement
- validation
- status code
- response schema
- error schema

For V2, explicitly document differences from V1.

### E2E
Critical flows:
1. register → verify → login → authenticated API
2. OAuth login if enabled
3. chat non-streaming → usage → billing
4. chat streaming → disconnect/success/error → settlement
5. concurrent requests against limited balance
6. admin adds/disables model
7. admin changes price with historical usage preserved
8. background job execution
9. graceful shutdown

## Billing invariants
Automated tests must prove:
- balance cannot become negative when reservation rules prohibit it;
- every completed charge has exactly one ledger settlement;
- duplicate settlement is idempotent;
- ledger balance equals wallet balance;
- historical price version is unchanged;
- failed provider call releases reservation;
- actual usage is recorded when provider supplies it.

## Auth invariants
- revoked session cannot authenticate;
- password failures follow intended policy;
- OAuth account mapping is deterministic;
- email verification state is respected;
- authorization cannot be bypassed by route version.

## Migration quality gate
Every phase must run the smallest relevant test set first, then the complete project checks before completion.

Record:
- command
- result
- duration if useful
- failures
- known unrelated failures

Do not report a phase as complete while required checks are failing.

## Regression policy
A migration PR must not knowingly change an existing public contract unless the phase explicitly introduces a new API version or documents a deliberate compatibility change.
