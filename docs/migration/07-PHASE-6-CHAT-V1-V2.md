# Phase 6 — Chat Migration + Token Billing + API Compatibility

## Objective
Move chat to the new Nest/application architecture while preserving existing clients through V1 and introducing V2 only where the public contract must change.

## Target flow
```text
HTTP V1/V2 Controller
  ↓
DTO + auth guard
  ↓
Chat Application Service
  ↓
LLM Service / Model Resolver
  ↓
Billing reservation
  ↓
Provider Adapter
  ↓
Usage normalization
  ↓
Billing settlement
  ↓
Response / SSE
```

## V1 compatibility
Keep `/api/v1/chat` behavior stable where possible. If old clients expect fixed-price semantics in the response, use a compatibility mapper/adapter over the new billing engine rather than maintaining a separate billing engine.

Conceptually:
```text
V1 Billing Adapter ─┐
                    ├── New Billing Engine
V2 Billing Adapter ─┘
```

Do not duplicate accounting logic.

## V2
Use V2 only for intentional breaking contract changes. A suitable V2 response can expose:
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

The exact response must be based on the current frontend contract and Phase 0 inventory.

## Streaming
Preserve SSE if current clients depend on it.

Requirements:
- cancellation must abort provider work when supported;
- client disconnect must not leave orphaned provider streams;
- final usage event/record must be persisted when available;
- billing settlement must occur exactly once;
- errors must use documented SSE events/status semantics;
- heartbeat behavior must not create resource leaks.

## Cache interaction
Current chat flow may check cache before charging for cacheable tasks. Re-evaluate this under token billing:
- cache hit with no provider call should have an explicitly defined billing policy;
- cache-generated response must not invent provider token usage;
- if cache is free, response must clearly report zero provider usage and zero charge;
- if cache has a platform charge, define that separately.

Do not silently carry over old assumptions.

## Acceptance criteria
- [ ] V1 clients continue working.
- [ ] V2 exists only where needed.
- [ ] Both versions share the same application/domain logic where semantics are shared.
- [ ] Billing is reservation + settlement, not fixed tier deduction.
- [ ] Non-streaming usage is persisted.
- [ ] Streaming usage is persisted and settled exactly once.
- [ ] Disconnect/cancel paths are tested.
- [ ] Cache billing policy is explicit.
- [ ] Fixed `cheap/balanced/deep` charge constants are no longer authoritative.
