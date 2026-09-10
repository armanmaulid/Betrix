# Phase 5 — Token-Based Credits, Ledger, Reservation & Settlement

## Objective
Replace fixed per-tier chat charging with auditable charging based on actual token usage and DB-managed model pricing.

## Current verified behavior
`PgCreditRepository` currently performs atomic transactional balance updates and writes credit transactions. Chat use cases currently deduct a fixed tier amount, call the AI provider, and refund on provider failure. Token usage is already available after provider calls.

Do not replace the transaction with an unsafe read-modify-write pattern.

## Target accounting model
```text
request
  ↓
price resolver
  ↓
reserve estimated maximum
  ↓
provider call/stream
  ↓
actual token usage
  ↓
calculate provider cost
  ↓
calculate user charge
  ↓
settle reservation
  ↓
immutable ledger + usage record
```

## Recommended entities
```text
credit_wallet
- user_id PK
- balance_microcredits
- version
- updated_at

credit_ledger
- id
- user_id
- type
- amount_microcredits
- balance_after_microcredits
- reference_type
- reference_id
- metadata
- created_at

llm_usage
- id
- request_id UNIQUE/idempotency key where applicable
- user_id
- model_id
- price_version_id
- task_type
- input_tokens
- output_tokens
- cached_input_tokens nullable
- total_tokens
- provider_cost_microcredits
- platform_charge_microcredits
- credits_charged_microcredits
- usage_source
- created_at
```

Reservation can be represented as a ledger entry/stateful billing record if that produces stronger idempotency. Do not invent a second balance system.

## Units
Use integer fixed-point units.

Example:
`1 credit = 1,000,000 microcredits`

Never store monetary/token-derived charge values as floating point.

## Charge formula
The exact formula must be encoded centrally and tested. Conceptually:

```text
provider_cost =
  input_tokens × input_price
+ output_tokens × output_price
+ cached_input_tokens × cached_input_price

platform_charge = provider_cost × markup policy
credits_charged = provider/platform charge converted to microcredits
```

The implementation must account for provider pricing units and rounding deterministically. The rounding rule must be documented and tested.

## Reservation
For non-streaming calls, reserve enough credit to cover the maximum possible charge before the provider call when actual usage is not known beforehand.

For streaming calls:
1. reserve an upper bound;
2. stream normally;
3. obtain final usage if provider supplies it;
4. settle actual charge;
5. release/refund unused reservation.

If a provider cannot return usage, define an explicit fallback estimation policy and mark usage source accordingly. Do not pretend estimated usage is exact.

## Failure/idempotency
- Provider failure: release reservation; no final user charge.
- Timeout after provider may have accepted request: reconcile according to provider request ID/idempotency support.
- Duplicate settlement request: must be idempotent.
- Concurrent requests: must not overspend wallet.
- DB transaction failure: no partial ledger/balance state.

## Historical auditability
Every completed usage charge must identify:
- user
- model
- task type
- token counts
- price version
- provider cost
- platform charge
- final credits charged
- request/reference ID
- timestamp

Never recalculate historical charges using today's price.

## Migration from old credits
If `users.credits` is currently integer credits:
1. snapshot balances;
2. create wallet rows;
3. migrate each balance to fixed-point representation;
4. create an opening-balance ledger entry;
5. reconcile totals;
6. only then switch writes to wallet/ledger.

Preserve legacy transaction history and map it to a clear legacy/opening/migration type rather than fabricating token usage.

## Acceptance criteria
- [ ] Wallet debit is atomic under concurrency.
- [ ] Every charge has immutable ledger evidence.
- [ ] Every LLM usage has price-version evidence.
- [ ] Provider failure does not leave a permanent charge.
- [ ] Streaming settles actual usage where available.
- [ ] Duplicate settlement is idempotent.
- [ ] Historical charges remain reproducible.
- [ ] No frontend value can override server billing.
- [ ] Reconciliation test proves wallet balance = ledger-derived balance.
