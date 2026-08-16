# Betrix Backend — Deep Review Bug Report
Reviewed: `src/` (post-DDD-refactor, all 9 phases). `tsc`/`lint`/`test` all pass (0/0/51-51) — none of the bugs below are caught by the existing test suite or type checker, because they're logic/behavior bugs, not type errors.

Each entry below is self-contained: **what**, **where**, **why it's wrong**, **exact fix**. Apply fixes in the order listed — none depend on each other except where noted. Do not "improve" or reinterpret the fix instructions; apply them literally.

---

## BUG-01 — Dead validation on 3 market routes (duplicate route registration)
**Severity: Medium** · **File:** `src/presentation/routes/v1/market.routes.ts`

**What's wrong:** `GET /prices`, `GET /ohlc/all`, and `GET /ohlc/:symbol/:timeframe` are each registered TWICE in this file — once early without `validate()`, once later (after the Zod schemas are defined) with `validate()`. Express matches the FIRST registration for a given method+path. Since the controller methods (`getPrices`, `getAllOHLC`, `getOHLC`) always terminate the response on success (they never call `next()` except on error), the SECOND registration — the one with validation — is never reached. It is dead code.

**Proof:** confirmed by isolated Express repro — first-registered handler always wins, second is never invoked.

**Impact:** query/param validation for these 3 endpoints does not run. `/prices` and `/ohlc/all` are partially protected by manual `if (!x)` checks inside the controller, but `/ohlc/:symbol/:timeframe` has no such fallback — empty or malformed `symbol`/`timeframe` values can reach `MarketDataService.getOHLC` unvalidated.

**Fix:** Delete the FIRST (unvalidated) registration of each of these 3 routes. Keep only the validated versions (the ones using `validate(pricesQuerySchema)`, `validate(ohlcQuerySchema)`, `validate(ohlcParamSchema)`), in their current position in the file (near the bottom, after schema definitions). Do not merge or duplicate — end state must have exactly ONE registration per route, and it must be the validated one. After the fix, `router.get("/prices", ...)`, `router.get("/ohlc/all", ...)`, and `router.get("/ohlc/:symbol/:timeframe", ...)` should each appear exactly once in the file.

**Verify:** `grep -c 'router.get("/prices"' src/presentation/routes/v1/market.routes.ts` → must print `1` (same for `/ohlc/all` and `/ohlc/:symbol/:timeframe`).

---

## BUG-02 — `getSymbols` validates a query param that isn't the one actually used
**Severity: Low** · **Files:** `src/presentation/controllers/MarketController.ts` (`getSymbols` method), `src/application/dtos/market.dto.ts` (`getSymbolsDto`)

**What's wrong:** `getSymbolsDto` validates a field called `activeOnly`. The controller's `getSymbols` method reads `req.query.active` (different name). Since the names don't match, whatever the client sends as `active` is never checked by the Zod schema, and `activeOnly` (which IS checked) is never read by the controller.

**Fix:** Rename the field in `getSymbolsDto` from `activeOnly` to `active` (do NOT change the controller — `active` is the name actually wired to behavior and presumably already documented/used by the frontend). In `src/application/dtos/market.dto.ts`, change:
```
activeOnly: z.coerce.boolean().default(true),
```
to:
```
active: z.coerce.boolean().default(true),
```
inside `getSymbolsDto`. Leave `getSymbolsDto`'s exported type name and everything else unchanged.

**Verify:** `GET /market/symbols?active=false` should now be schema-validated (currently it silently bypasses validation).

---

## BUG-03 — Rate limiters key on raw `req.ip`, not the normalized IP used everywhere else
**Severity: Low–Medium (security-adjacent)** · **File:** `src/core/middleware/rateLimiter.ts`

**What's wrong:** `createIpKeyGenerator()` buckets requests by `req.ip` directly. Every other part of the codebase (documented in `docs/session-context.md` §8i) deliberately normalizes IPs via `req.normalizedIP` (e.g. `::1` → `127.0.0.1`, `::ffff:x` → `x`) specifically because raw `req.ip` can represent the same client two different ways. The rate limiters were not updated to match, so the same client can land in two different rate-limit buckets depending on which IP representation a given request happens to carry, weakening the limiter.

**Fix:** In `src/core/middleware/rateLimiter.ts`, change `createIpKeyGenerator`:
```ts
function createIpKeyGenerator() {
  return (req: Request) => ipKeyGenerator(req.ip || "unknown");
}
```
to:
```ts
function createIpKeyGenerator() {
  return (req: Request) => ipKeyGenerator(req.normalizedIP || req.ip || "unknown");
}
```
This makes it consistent with `authLimiter`'s handler (line 25 of the same file) and with `AuthController`/`AdminController`, which already prefer `req.normalizedIP || req.ip`.

**Verify:** no behavior change for normal single-representation clients; fixes bucket-splitting for dual-stack/proxy clients.

---

## BUG-04 — Login lockout is keyed on (email, IP) pair, not email alone — bypassable by rotating IPs
**Severity: Medium (security design gap, needs a product decision, not just a code fix)** · **File:** `src/data/repositories/PgLoginAttemptRepository.ts` (`isAccountLocked`, `recordFailedLogin`)

**What's wrong:** `isAccountLocked` only locks out a specific `(email, ip)` combination after 10 failures in 15 minutes. An attacker brute-forcing one account from many different IPs (VPN rotation, botnet, etc.) never triggers the lockout, because each IP gets its own fresh count of 10. The IP-keyed `authLimiter` rate limiter (10 req / 5 min per IP) has the identical weakness for the same reason.

**This is flagged, not auto-fixed**, because the correct fix depends on a product tradeoff you need to decide: a pure per-email lockout (ignoring IP) stops distributed brute force but lets an attacker lock a legitimate user out of their own account just by failing 10 times with the right email (denial-of-service on that one account). Common mitigations: keep the per-(email,ip) lock as-is AND add a second, longer/looser per-email-only lock (e.g. 30 failures/hour across all IPs → CAPTCHA or short delay, not a hard lock), or add progressive delays. Decide the policy, then I can implement it — don't want an AI to unilaterally pick the lockout policy for a live auth system.

---

## BUG-05 — `GetSessionsUseCase` can display the wrong IP/User-Agent for a device with multiple sessions sharing a fingerprint
**Severity: Low (cosmetic/informational display only, no security or data-integrity impact)** · **File:** `src/application/use-cases/auth/GetSessionsUseCase.ts`

**What's wrong:** `sessionMetaByFingerprint` is built by iterating `userSessions` (from `SessionRepository.findByUserId`, which in the Redis implementation comes from `SMEMBERS` — Redis does not guarantee any particular order for set members) and keeping only the FIRST session's ip/userAgent per fingerprint (`if (... && !sessionMetaByFingerprint.has(...))`). If the same device (same fingerprint) has more than one active session — e.g. logged in twice, or the IP changed between logins on the same device — which session's metadata gets shown for that device in `/auth/sessions` is effectively random, not necessarily the most recent one.

**Fix:** In `src/application/use-cases/auth/GetSessionsUseCase.ts`, when building `sessionMetaByFingerprint`, prefer the session with the latest `lastSeenAt`/`createdAt` instead of first-seen-in-iteration-order. Concretely, replace the loop:
```ts
for (const s of userSessions) {
  if (s.deviceFingerprint && !sessionMetaByFingerprint.has(s.deviceFingerprint)) {
    sessionMetaByFingerprint.set(s.deviceFingerprint, { ip: s.ip, userAgent: s.userAgent });
  }
}
```
with a version that keeps the session with the newest `createdAt` for each fingerprint (overwrite whenever a newer one is found, rather than keeping only the first seen):
```ts
for (const s of userSessions) {
  if (!s.deviceFingerprint) continue;
  const existing = sessionMetaByFingerprint.get(s.deviceFingerprint);
  if (!existing || s.createdAt > existing.createdAt) {
    sessionMetaByFingerprint.set(s.deviceFingerprint, { ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt });
  }
}
```
(adjust the `Map` value type to include `createdAt` accordingly, and drop it when reading `meta?.ip`/`meta?.userAgent` further down — no other change needed there).

**Verify:** requires 2 sessions on the same device (same fingerprint) with different IPs to observe; not coverable by the current unit tests without a live Redis.

---

## BUG-06 — Audit log SQL fetches actor/target email+name, but the code path throws that data away and shows blank/wrong values instead
**Severity: Medium–High** · **Files:** `src/data/repositories/PgAdminActionRepository.ts`, `src/domain/entities/AdminAction.ts`, `src/application/use-cases/admin/GetAuditLogsUseCase.ts`, `src/application/use-cases/admin/ExportAuditLogsUseCase.ts`

**What's wrong:** `PgAdminActionRepository.findAll` runs a SQL query that JOINs `users` twice specifically to compute `actor_type` (via `CASE WHEN u.is_admin THEN 'admin' ELSE 'user' END`), `actor_email`, `actor_name`, `target_email`, `target_name` — real, correct data. But `mapRow()` only reads `id, admin_id, action, target_type, target_id, details, ip, user_agent, created_at` into the `AdminAction` entity — none of the 5 joined columns are kept, because `AdminAction` (in `domain/entities/AdminAction.ts`) has no fields for them. Downstream, both `GetAuditLogsUseCase` and `ExportAuditLogsUseCase` then hardcode:
```ts
actorType: a.action.startsWith("user_") ? "user" : "admin",  // never true — no action starts with "user_"
targetEmail: null,
targetName: null,
admin: { email: "", name: null },
```
**Impact:** the admin Audit Log screen and the CSV/JSON export both show a blank actor email/name and blank target email/name for every single row, and `actorType` is always "admin" regardless of what the SQL actually determined — despite the SQL having already computed the correct values. This looks like a working feature (the query is clearly built for it) that got silently disconnected during the refactor.

**Fix (do all 3 files together, in this order):**
1. In `src/domain/entities/AdminAction.ts`, add 4 optional fields to the `AdminAction` class constructor and `create()`: `actorType?: "admin" | "user"`, `actorEmail?: string | null`, `actorName?: string | null`, `targetEmail?: string | null`, `targetName?: string | null`. Keep them optional (default `undefined`/`null`) so `AdminAction.create()` (used when SAVING a new action, which never has this joined data) still works unchanged.
2. In `src/data/repositories/PgAdminActionRepository.ts`, update the `AdminActionRow` interface to include `actor_type: string`, `actor_email: string | null`, `actor_name: string | null`, `target_email: string | null`, `target_name: string | null`, and update `mapRow()` to pass them into the new `AdminAction` fields.
3. In `GetAuditLogsUseCase.ts` and `ExportAuditLogsUseCase.ts`, replace the hardcoded lines with the real values from the entity: `actorType: a.actorType`, `targetEmail: a.targetEmail`, `targetName: a.targetName`, `admin: { email: a.actorEmail ?? "", name: a.actorName ?? null }`.

**Verify:** hit `/admin/audit-logs` after the fix — actor email/name and target email/name columns should be populated, not blank.

---

## BUG-07 — `UpdateUserUseCase` (ban/suspend/grant-admin) writes NO audit log entry
**Severity: Medium–High (compliance/security gap)** · **File:** `src/application/use-cases/admin/UpdateUserUseCase.ts`

**What's wrong:** `DeleteUserUseCase`, `ResetUserPasswordUseCase`, and `BroadcastMessageUseCase` all call `activityLogRepo.logAdminAction(...)` after their action. `UpdateUserUseCase` — which is what bans/suspends/reactivates a user AND grants/revokes admin privileges — does not inject `ActivityLogRepository` at all and never logs anything. `AdminActionType.UPDATE_USER = "update_user"` exists in the enum specifically for this, but is never actually used anywhere in the codebase (confirmed by grep — the only occurrence of `UPDATE_USER`/`update_user` in `src/` is the enum declaration itself).

**Impact:** the single most sensitive admin action in the system (granting another account admin rights, or banning/suspending a user) leaves zero trace in the audit log, while less sensitive actions (broadcast, password reset) are logged.

**Fix:** In `src/application/use-cases/admin/UpdateUserUseCase.ts`:
1. Add `@inject("ActivityLogRepository") private activityLogRepo: ActivityLogRepository` to the constructor (import from `@domain/repositories/ActivityLogRepository.js`, same pattern as `DeleteUserUseCase`).
2. After `await this.userRepo.save(updatedUser);`, add:
```ts
await this.activityLogRepo.logAdminAction({
  adminId: input.adminId,
  action: AdminActionType.UPDATE_USER,
  targetType: "user",
  targetId: input.targetUserId,
  details: { statusChanged: input.status !== undefined, isAdminChanged: input.isAdmin !== undefined, newStatus: input.status, newIsAdmin: input.isAdmin },
  ip: input.requestIp,
  userAgent: input.requestUserAgent,
});
```
(import `AdminActionType` from `@domain/entities/AdminAction.js`.)

**Verify:** ban a test user, then check `/admin/audit-logs` — an `update_user` entry should now appear (it currently does not).

---

## BUG-08 — Highest-volume tables (`token_usage`, `chat_logs`, `user_activity_logs`, `calendar_events`, `failed_login_attempts`) have `cleanupOlderThan()` implemented but are never actually cleaned up — unbounded growth
**Severity: Medium (operational/scaling risk, not urgent but will bite eventually)** · **Files:** `src/application/use-cases/admin/SystemCleanupUseCase.ts` (what's missing), `src/data/repositories/PgUsageRepository.ts`, `PgCalendarRepository.ts`, `PgLoginAttemptRepository.ts` (unused methods), `src/domain/repositories/ChatRepository.ts` / `ActivityLogRepository.ts` (no cleanup method exists at all)

**What's wrong:** `HourlyCleanupJob` calls only `SystemCleanupUseCase.execute()`, which cleans 3 things: verification tokens, old news, and the general cache. Meanwhile:
- `PgUsageRepository.cleanupOlderThan(days)` (deletes from `token_usage` — written on EVERY chat message via `ChatLoggingHandler`) — defined, never called anywhere.
- `PgCalendarRepository.cleanupOlderThan(days)` — defined, never called anywhere.
- `PgLoginAttemptRepository.cleanupOlderThan(days)` (deletes from `failed_login_attempts`) — defined, never called anywhere.
- `chat_logs` (via `ChatRepository`) and `user_activity_logs`/`admin_actions`/metrics (via `ActivityLogRepository`) — these two repository interfaces don't even have a cleanup method defined, let alone wired up.

**Impact:** `token_usage` and `chat_logs` in particular grow by roughly 1 row per chat message, per table, forever — for a chat-based product this is the fastest-growing data in the whole system, and nothing prunes it. Over months this degrades query performance (the exact queries in `GetUsageUseCase`/`GetChatHistoryUseCase` scan these tables) and increases storage cost. Not urgent today, but worth deciding a retention policy before it becomes a production incident.

**Fix (needs a retention-period decision per table, similar in spirit to BUG-04 — I'd suggest starting values below, adjust as you like):**
1. In `SystemCleanupUseCase.ts`, inject `UsageRepository`, `CalendarRepository`, `LoginAttemptRepository` and add them to the `Promise.allSettled` array, e.g. `this.usageRepo.cleanupOlderThan(90)`, `this.loginAttemptRepo.cleanupOlderThan(30)`. For `calendar_events`, think twice before auto-deleting — historical calendar data may be wanted for backtesting; consider leaving it out or using a much longer retention (e.g. 365+ days) if you do add it.
2. For `chat_logs` and `user_activity_logs`/`token_usage`-adjacent metrics: add a `cleanupOlderThan(days): Promise<number>` method to `ChatRepository` and `ActivityLogRepository` (interface + Pg implementation, same `DELETE ... WHERE created_at < NOW() - INTERVAL '1 day' * $1` pattern already used elsewhere), then wire into `SystemCleanupUseCase` too.

**Verify:** N/A until deployed for a while — this is a preventive fix, not a currently-visible symptom.

---

## BUG-09 — Device-to-account binding has a TOCTOU race: two concurrent registrations from the same device fingerprint can silently steal the device from one account and give it to another
**Severity: Medium** · **File:** `src/application/use-cases/auth/RegisterUseCase.ts` + `src/data/repositories/PgDeviceRepository.ts` (`bind`)

**What's wrong:** `RegisterUseCase` checks `deviceRepo.findUserByFingerprint(fingerprint)` and throws `ConflictError` if the device is already registered to someone — but this check and the later `deviceRepo.bind(...)` call are two separate, non-atomic steps. `PgDeviceRepository.bind()` does:
```sql
INSERT INTO user_devices (...) VALUES (...)
ON CONFLICT (device_fingerprint) DO UPDATE SET user_id = EXCLUDED.user_id, ...
```
If two registration requests from the same physical device (same fingerprint) race each other, both can pass the `findUserByFingerprint` check (neither sees the other's not-yet-committed row), and then both proceed to create separate user accounts and both call `bind()`. The second `bind()` call's `ON CONFLICT DO UPDATE` will silently reassign the device from the first account to the second — no error, no conflict — defeating the entire point of the check (compare to how `RedisDeviceSessionRepository.setSessionForDeviceAtomic` correctly uses atomic `SET NX` specifically to avoid this same class of race for sessions).

**Fix:** Make `bind()` fail instead of silently overwriting when the fingerprint is already bound to a *different* user. Change the query in `PgDeviceRepository.bind()`:
```sql
INSERT INTO user_devices (id, user_id, device_fingerprint, created_at, last_seen_at)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (device_fingerprint) DO UPDATE SET
  last_seen_at = EXCLUDED.last_seen_at
WHERE user_devices.user_id = EXCLUDED.user_id
RETURNING *
```
(i.e. only allow the UPDATE branch to touch a row that already belongs to the SAME user — updating `last_seen_at` on re-login — and drop `user_id = EXCLUDED.user_id` entirely so it can never reassign ownership). Then in the calling code (`RegisterUseCase` and `AuthService.establishAuthenticatedSession`), check whether `bind()` returned a row; if it returned nothing (the `WHERE` excluded the conflicting row), treat it as a conflict — for `RegisterUseCase` this should roll back the just-created user or convert to the same `ConflictError` as the pre-check; for login, decide whether login-from-a-device-registered-to-another-account should be blocked or just not update the device record (this second part is a product decision, similar to BUG-04 — flagging rather than prescribing).

**Verify:** requires firing 2 concurrent registration requests with the same forged device fingerprint to reproduce; not easily covered by the current test suite.

---

## BUG-10 — Google OAuth login matches existing accounts by raw email string, with no check that the account is verified or that Google's proof of ownership actually applies to it — pre-registration/email-squatting can hijack a future Google login
**Severity: Medium–High (needs a product/security decision, not just a code fix)** · **File:** `src/config/passport.ts` (Google strategy callback) + `src/presentation/controllers/AuthController.ts` (`googleCallback`)

**What's wrong:** When someone signs in with Google, `passport.ts` looks up `userRepo.findByEmail(email)`. If a user with that email already exists (for ANY reason — including a password registration nobody ever verified), it logs them straight into that existing account via `done(null, user)`, with no check on `emailVerified` and no attempt to link/confirm `googleId` against a pre-existing unverified record. `AuthController.googleCallback` then calls `establishAuthenticatedSession` directly — unlike password login (`LoginUseCase`), which explicitly checks `if (requireVerification && !user.emailVerified) throw ...`, the Google path has no equivalent check at all.

**Why this matters:** if `RegisterUseCase` allows account creation before email verification completes (it does — verification is only enforced at password-login time, not at registration time), an attacker can pre-register an account using a victim's email address (attacker sets the password, account sits unverified). Later, when the real owner of that email signs in with "Login with Google," the app looks up by email, finds the attacker's pre-registered account, and logs the victim into the attacker-controlled account — the attacker already knows the password and can now access whatever the victim does in that session.

**This is flagged, not auto-fixed**, because the right behavior depends on a decision: e.g. (a) when Google OAuth finds an existing but UNVERIFIED account by email, refuse to auto-login and instead force a distinct "claim this email" flow, or (b) treat Google's email confirmation as proof and atomically mark the account verified + invalidate/replace any password that was set on it before the Google-verified login happens. Both are reasonable but have different UX/security tradeoffs — let me know which direction you want and I'll implement it.

---

## BUG-11 — Broker symbol sync uses total COUNT as the "did anything change" signal, which misses same-count changes (renames, category/description edits, or a symbol becoming tradeable/non-tradeable while total count stays the same)
**Severity: Medium** · **File:** `src/application/services/SymbolService.ts` (`syncBrokerSymbols`)

**What's wrong:**
```ts
const count = await this.brokerClient.fetchSymbolCount();
const storedCount = await this.symbolRepo.getStoredCount();
if (count === storedCount) return; // skip sync entirely
```
This only re-syncs symbol details when the TOTAL symbol count differs from last time. If the broker adds one symbol and removes another in the same period (net count unchanged), or changes an existing symbol's `description`/`category`/tradeable-status (`trade_mode`, which drives `isActive`) without changing the total count, the sync is skipped and `broker_symbols` silently goes stale — indefinitely, since nothing else ever forces a re-sync. This directly compounds the already-documented pending item (`BrokerSymbol.trade_mode` not modeled yet, per `docs/ddd-refactor-plan.md` §M4) — even once that field is added, this sync heuristic still won't detect a same-count `trade_mode` flip.

**Fix:** Don't gate the sync on count equality alone. Simplest robust fix: always call `fetchSymbols()` and `saveMany()` (the `ON CONFLICT DO UPDATE` in `PgSymbolRepository.saveMany` is already idempotent/cheap for unchanged rows), and use the count purely as a logging/sanity signal rather than a skip condition:
```ts
async syncBrokerSymbols(): Promise<void> {
  const symbols = await this.brokerClient.fetchSymbols();
  if (symbols.length > 0) {
    await this.symbolRepo.saveMany(symbols);
    await this.symbolRepo.setStoredCount(symbols.length);
    logger.info(`Synced ${symbols.length} broker symbols`, { context: "Symbols" });
  }
}
```
If the concern was avoiding load on the MT5 bridge from a full symbol-list fetch every run, that's a separate, explicit throttling decision (e.g. only skip if this ran within the last N hours) — not something total-count-equality can safely stand in for.

**Verify:** no easy automated check; would need to watch `broker_symbols.updated_at` actually advance on a sync run even when `fetchSymbolCount()` returns the same number as last time.

---

## Not bugs, but noted while reviewing (no action needed)
- `sanitize.ts` runs `xss()` over `req.body` globally, including password fields, before validation. This is consistent both at register and login (same transform both times), so login still works — but it means certain characters in a chosen password are silently stripped/escaped without telling the user. Worth knowing about if a user ever reports "my password doesn't work" after using unusual characters — it's not corruption, it's silent transformation. Leaving as-is unless you want password fields excluded from sanitization.
- `AuthController.register`'s duplicate-email path deliberately returns `sessionToken: ""` and omits `user` in the JSON response — this is intentional anti-enumeration behavior (always 201, generic message), already correctly guarded in the controller. Confirmed NOT a bug.
- `BroadcastMessageUseCase`'s comment says email sending is done "sequentially... to avoid too many parallel queries," but the code actually fires all emails in parallel via `.map()` + `Promise.allSettled`. For `recipients: "all"` this can mean up to ~10,000 concurrent `findById` + SMTP send calls at once. Not marked as a numbered bug because it may be fine at current user-base scale, but flagging since the comment's stated intent doesn't match the code — worth adding a concurrency limit (e.g. batches of 20-50) before the user base grows, or at least fixing the misleading comment.
- `GetUsersUseCase` always returns `stats: { totalChats: 0, totalTokens: 0 }` for every user (comment: "Would need separate queries") — this is a known incomplete stub, not a logic error, but worth knowing the admin user-list screen currently shows fake zeros for those two columns rather than omitting them.

---

## Summary
| # | Severity | File(s) | One-line fix |
|---|---|---|---|
| BUG-01 | Medium | `market.routes.ts` | Delete the 3 duplicate unvalidated route registrations |
| BUG-02 | Low | `market.dto.ts` | Rename `activeOnly` → `active` in `getSymbolsDto` |
| BUG-03 | Low–Medium | `rateLimiter.ts` | Use `req.normalizedIP \|\| req.ip` in key generator |
| BUG-04 | Medium (needs decision) | `PgLoginAttemptRepository.ts` | Product decision needed before coding |
| BUG-05 | Low | `GetSessionsUseCase.ts` | Pick newest session per fingerprint, not first-seen |
| BUG-06 | Medium–High | `AdminAction.ts`, `PgAdminActionRepository.ts`, `Get/ExportAuditLogsUseCase.ts` | Carry actor/target email+name through from SQL to entity to response |
| BUG-07 | Medium–High | `UpdateUserUseCase.ts` | Add missing `logAdminAction` call |
| BUG-08 | Medium | `SystemCleanupUseCase.ts` + 2 missing repo methods | Wire up existing `cleanupOlderThan` methods; add missing ones for chat/activity logs |
| BUG-09 | Medium | `PgDeviceRepository.ts` (`bind`) | Make device-rebind atomic/conditional instead of silent overwrite |
| BUG-10 | Medium–High (needs decision) | `passport.ts`, `AuthController.ts` | Product decision needed before coding |
| BUG-11 | Medium | `SymbolService.ts` | Don't skip sync based on count-equality alone |
