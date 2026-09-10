# Frontend Compatibility and API Migration

## Objective
Prevent frontend releases from being coupled to backend implementation details.

## Current verified concern
Existing frontend/admin code contains task-tier mappings and fixed credit costs for UI estimation. These must not remain the billing source of truth.

## Rules
1. Frontend calls versioned APIs.
2. Frontend must not calculate authoritative billing.
3. Frontend displays server-returned usage and charge.
4. If a preflight estimate is needed, expose an explicit server estimate endpoint.
5. Model lists/options come from API/database, not hardcoded frontend constants.
6. API version changes require explicit frontend compatibility work.

## Recommended response information
Where applicable:
```json
{
  "usage": {
    "inputTokens": 1234,
    "outputTokens": 456,
    "totalTokens": 1690
  },
  "billing": {
    "creditsCharged": 3,
    "balance": 97
  }
}
```

Exact schema is decided from Phase 0 contract inventory.

## Version migration
For a breaking chat contract:
- keep `/api/v1/chat` for old clients;
- add `/api/v2/chat`;
- release frontend support for V2;
- monitor V1 traffic;
- deprecate V1;
- remove V1 only after sunset criteria.

## Admin frontend
Admin UI should consume:
- provider/model registry
- task assignments
- pricing versions
- usage statistics
- billing/reconciliation data

Do not embed provider/model secrets.

## Acceptance criteria
- [ ] No frontend fixed-price constant is authoritative.
- [ ] Model choices are server-driven.
- [ ] V1 compatibility is tested.
- [ ] V2 contract is documented if introduced.
- [ ] Usage and billing are displayed from server data.
