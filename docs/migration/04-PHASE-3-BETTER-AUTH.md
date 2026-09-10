# Phase 3 — Better Auth Migration

## Objective
Make Better Auth the single authority for authentication identity and sessions while preserving Betrix-specific security/domain features.

## Current verified behavior to preserve/inventory
`LoginUseCase` currently performs password verification, login-attempt handling, CAPTCHA/progressive delay behavior, session/device persistence, email-verification checks and activity logging. Existing dependencies also include Passport/Google OAuth and bcrypt. The database contains auth-related tables such as sessions, email verifications, failed login attempts and user devices.

Do not delete these until the replacement has parity.

## Target authority
Better Auth owns:
- user identity needed by auth
- password credential/account handling
- sessions
- verification tokens/workflows supported by Better Auth
- OAuth accounts/providers supported by Better Auth

Betrix owns separately:
- user profile
- preferences
- device/business policies not covered by Better Auth
- audit/activity domain records
- credits/billing
- application authorization roles/permissions where appropriate

## Integration isolation
Put Better Auth behind `AuthModule`.

The rest of the application should depend on an internal `CurrentUser`/auth abstraction, not Better Auth APIs.

Because the Nest/Fastify Better Auth integration ecosystem can involve community adapters, isolate that integration so it can be replaced without changing domain/application code.

## Session strategy
Do not maintain all of these simultaneously after cutover:
- Better Auth sessions
- custom DB sessions
- custom Redis session repository
- Passport session authority
- bespoke JWT session authority

Choose one authoritative session mechanism. Redis may remain for unrelated cache/rate-limit/queue purposes.

## Security parity checklist
Verify explicitly:
- password hashing and verification
- account enumeration resistance
- login attempt tracking
- CAPTCHA behavior
- progressive delay/rate limits
- email verification
- Google OAuth
- logout/session revocation
- session expiration
- device policy
- audit logging
- authorization/role checks
- CSRF/cookie settings where applicable
- CORS/credential behavior

## User migration
If legacy users are already persisted:
1. map old identity to Better Auth user/account records;
2. preserve stable application user ID where possible, or create a deterministic mapping table;
3. migrate only required identity fields;
4. preserve profile/domain records separately;
5. define password migration strategy—never copy plaintext passwords;
6. test existing and newly registered users;
7. support rollback until cutover is proven.

## API versioning
Keep `/api/v1/auth/*` stable during migration. The internal auth provider may change without changing the public contract. If a public contract must break, introduce `/api/v2/auth/*`.

## Acceptance criteria
- [ ] Better Auth is the only session authority after cutover.
- [ ] Existing user login works.
- [ ] New registration works.
- [ ] Logout/revocation works.
- [ ] Email verification works.
- [ ] Google OAuth works if still required.
- [ ] CAPTCHA/rate-limit/device policies remain enforced where required.
- [ ] Auth security regression tests pass.
- [ ] Passport/custom session code is removable.
- [ ] User/profile separation is documented.
- [ ] Rollback procedure is tested.
