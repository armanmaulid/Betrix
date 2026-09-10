# Phase 4 — Database-Driven LLM Registry, Routing & Pricing

## Objective
Remove hardcoded model tiers and model configuration from environment variables as the normal runtime source. Admin must be able to add, disable/archive, configure and price models without code deployment.

## Current verified state
`ModelPolicy` currently maps task types to `cheap`, `balanced`, `deep` tiers with fixed credit costs. Environment variables provide model names and max token limits. Chat use cases resolve a tier/model before invoking the AI port.

## Target model architecture
```text
TaskType
   ↓
ModelResolver
   ↓
LLM model record + task assignment
   ↓
ProviderAdapter
   ↓
Provider
```

The domain should reason about capabilities and task intent, not `cheap/balanced/deep` as pricing tiers.

## Recommended entities
```text
llm_provider
- id
- slug
- name
- type
- enabled
- config_reference
- created_at
- updated_at

llm_model
- id
- provider_id
- model_key
- display_name
- active
- is_default
- supports_chat
- supports_vision
- supports_tools
- supports_reasoning
- context_window
- max_output_tokens
- metadata
- created_at
- updated_at

llm_task_config
- id
- task_type
- primary_model_id
- fallback_model_id nullable
- enabled
- max_input_tokens nullable
- max_output_tokens nullable
- updated_at

llm_model_price_version
- id
- model_id
- effective_from
- effective_to nullable
- input_price_per_1m
- output_price_per_1m
- cached_input_price_per_1m nullable
- markup_multiplier
- currency
- created_at
```

Exact columns must be reconciled with actual provider requirements and existing code before migration.

## Pricing rules
- Prices are versioned.
- Never overwrite historical pricing used by a completed charge.
- Store the price version ID on usage records.
- Store the resulting provider cost and platform charge on the usage record for auditability.
- Use integer fixed-point units.

## Provider abstraction
Create an internal interface supporting at minimum:
- non-streaming generation
- streaming generation
- normalized token usage
- provider/model identifier
- error classification
- optional health check

Existing `AiPort` can be evolved rather than discarded if it already expresses the required boundary.

Provider API keys must be kept in environment/secret management. Database rows may contain provider references/configuration identifiers, but not plaintext secrets.

## Admin operations
Admin API/UI must support:
- list providers
- create/update/disable provider
- list models
- add model
- edit model capabilities/limits
- enable/disable/archive model
- assign model to task type
- configure fallback
- create price version
- view effective price
- view usage by model/task

Hard-delete should be disabled for models with historical usage references.

## Compatibility
Existing frontend may know task tiers and estimated fixed prices. Treat that as legacy UI behavior. Server response becomes authoritative. Do not allow frontend constants to determine billing.

## Acceptance criteria
- [ ] Runtime model selection comes from DB.
- [ ] Admin can add a model without backend code change.
- [ ] Admin can disable/archive a model.
- [ ] Task-to-model assignment is configurable.
- [ ] Fallback behavior is deterministic and tested.
- [ ] Price history is immutable/versioned.
- [ ] Provider secrets are not stored plaintext.
- [ ] Existing AI gateway remains usable through adapter.
- [ ] Hardcoded model-tier selection is removed from the normal runtime path.
