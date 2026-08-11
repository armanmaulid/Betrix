# Betrix `Backend/src-new` — Bug Fix Spec

Confirmed bugs from a logic-lens style review, root-caused against the actual source. Each entry is self-contained: file, exact problem, exact fix. No design debate needed — just apply.

---

## BUG 1 (Critical) — Session deletion is a silent no-op due to double-hashing

**File:** `Backend/src-new/data/repositories/RedisSessionRepository.ts`

**Root cause:**
- `save()` stores the session token **already hashed** in the Redis set: `sadd('user_sessions:{userId}', hashedToken)` where `hashedToken = hashSessionToken(session.token)`.
- `deleteByUserId()` reads that same set with `smembers()` — getting back **already-hashed** tokens — then hashes them **again**: `const hashedTokens = tokens.map(hashSessionToken)`.
- Result: it computes `session:{hash(hash(token))}` and deletes that key, but the real key in Redis is `session:{hash(token)}`. The delete/srem calls are no-ops on nonexistent keys, while the function still returns a nonzero "count" as if it succeeded.
- The identical pattern exists in `findByUserId()` — it also calls `this.findByToken(token)` for each already-hashed token pulled from `smembers()`, and `findByToken()` internally hashes its input again. So `findByUserId()` **always returns an empty array**, even when sessions exist.

**Impact:**
- `ChangePasswordUseCase` claims to revoke all other sessions on password change — it does not. A stolen token stays valid after the victim changes their password.
- `ResetUserPasswordUseCase` (admin-triggered) has the same silent failure.
- `GetSessionsUseCase` ("view active sessions" feature) always shows zero sessions.

**Fix:**
In `deleteByUserId()`, do **not** re-hash tokens obtained from `smembers()` — they are already hashed. Build the Redis keys directly from them:

```ts
async deleteByUserId(userId: string, exceptToken?: string): Promise<number> {
  const hashedTokens = await redisClient.smembers(`user_sessions:${userId}`); // already hashed
  const hashedExceptToken = exceptToken ? hashSessionToken(exceptToken) : undefined;
  const tokensToDelete = hashedExceptToken
    ? hashedTokens.filter(t => t !== hashedExceptToken)
    : hashedTokens;

  if (tokensToDelete.length > 0) {
    const keysToDelete = tokensToDelete.map(token => `session:${token}`);
    await redisClient.del(...keysToDelete);
    await redisClient.srem(`user_sessions:${userId}`, ...tokensToDelete);
    for (const token of tokensToDelete) {
      sessionMemoryCache.delete(token);
    }
  }

  return tokensToDelete.length;
}
```

In `findByUserId()`, don't route already-hashed tokens back through `findByToken()` (which hashes again). Look up the session data directly using the hashed token as the Redis key:

```ts
async findByUserId(userId: string): Promise<Session[]> {
  const hashedTokens = await redisClient.smembers(`user_sessions:${userId}`); // already hashed
  const sessions: Session[] = [];

  for (const hashedToken of hashedTokens) {
    const cached = sessionMemoryCache.get(hashedToken);
    if (cached && Date.now() - cached.timestamp < SESSION_MEMORY_CACHE_TTL_MS) {
      sessions.push(cached.session);
      continue;
    }

    const uid = await redisClient.get(`session:${hashedToken}`);
    if (!uid) continue;

    const ttl = await redisClient.ttl(`session:${hashedToken}`);
    const expiresAt = ttl > 0 ? new Date(Date.now() + ttl * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Note: raw token is not recoverable from the hash — this session object's
    // `token` field will be the hashed value, not the original. Callers that
    // need the raw token (e.g. to display or re-auth) cannot get it from here;
    // that's a pre-existing one-way-hash constraint, not something this fix changes.
    const session = new Session(hashedToken, uid as string, hashedToken, new Date(), expiresAt, null, null, null);
    sessions.push(session);
  }

  return sessions;
}
```

**Test:** Log in twice (two sessions for one user). Call change-password. Confirm both old Redis `session:*` keys are actually gone (`redis-cli exists session:<hash>` → `0`), and the previously-issued tokens now get `401` on protected routes.

---

## BUG 2 (Critical) — `DeleteUserUseCase` never revokes the deleted user's session

**File:** `Backend/src-new/application/use-cases/admin/DeleteUserUseCase.ts`

**Root cause:** `SessionRepository` is injected in the constructor but never called anywhere in `execute()`. The user row is deleted from Postgres, but nothing touches Redis. `authMiddleware` only checks `sessionRepo.findByToken()` — it never re-validates that the user still exists in Postgres — so a deleted user's existing token keeps working until its 24h TTL naturally expires.

**Fix:** Call session revocation as part of the delete flow, using the fixed `deleteByUserId` from Bug 1. Also remove the dead imports (`sendEmail`, `hashPassword`, `generateSecureToken`, `broadcastToUser` are all unused — leftover from copy/paste).

```ts
import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { NotFoundError, ValidationError } from "@core/errors/index.js";
import { pgClient } from "@data/orm/pgClient.js";
import { logAdminAction } from "@domain/services/ActivityLogger.js";

interface DeleteUserInput {
  adminId: string;
  targetUserId: string;
  requestIp: string;
  requestUserAgent: string;
}

@injectable()
export class DeleteUserUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository
  ) {}

  async execute(input: DeleteUserInput): Promise<void> {
    if (input.targetUserId === input.adminId) {
      throw new ValidationError("Cannot delete your own account");
    }

    const { rows } = await pgClient.query(
      `DELETE FROM users WHERE id = $1 RETURNING email`,
      [input.targetUserId]
    );

    if (rows.length === 0) {
      throw new NotFoundError("User");
    }

    // Revoke all active sessions for the deleted user immediately
    await this.sessionRepo.deleteByUserId(input.targetUserId);

    await logAdminAction({
      adminId: input.adminId,
      action: "delete_user",
      targetType: "user",
      targetId: input.targetUserId,
      details: { email: rows[0].email },
      ip: input.requestIp,
      userAgent: input.requestUserAgent,
    });
  }
}
```

**Dependency:** Apply Bug 1's fix first — otherwise `deleteByUserId` here will still be a no-op.

**Test:** Log in as a user, grab the session token, have an admin delete that user, then immediately call any authenticated endpoint with the old token — must return `401`.

---

## BUG 3 (High) — `req.user.id` vs `req.user.userId` field mismatch breaks per-user rate limiting and request-log attribution

**Files:** `Backend/src-new/core/middleware/rateLimiter.ts`, `Backend/src-new/core/logging/requestLogger.ts`

**Root cause:** `presentation/middleware/auth.middleware.ts` sets `req.user = { userId, token }` — the field is `userId`, not `id`. But both files below read `.id`:

- `rateLimiter.ts` line 48 (inside `perUserLimiter`'s `keyGenerator`): `(req as any).user?.id` → always `undefined` → silently falls back to `ipKeyGenerator(req.ip)`. `RATE_LIMIT_PER_USER_PER_MINUTE` never actually limits per-user; every authenticated request is throttled per-IP instead.
- `requestLogger.ts` lines 34, 46, 55, 64: same `.id` access → `userId` is always `undefined` in every request log, for every non-admin route. (Admin routes only get a correct value because `admin.middleware.ts` later overwrites `req.user` with a full `User` entity that does have `.id` — but that happens after this logger's initial "incoming request" log already fired.)

**Fix:** Change `.id` to `.userId` in both files.

`core/middleware/rateLimiter.ts`:
```ts
export const perUserLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: env.RATE_LIMIT_PER_USER_PER_MINUTE,
  message: "Terlalu banyak request untuk akun ini, coba lagi sebentar lagi",
  keyGenerator: (req) => {
    const userId = (req as any).user?.userId;
    return userId ? `user:${userId}` : ipKeyGenerator(req.ip || "unknown");
  },
});
```

`core/logging/requestLogger.ts` — replace all four occurrences of `(req as any).user?.id` with `(req as any).user?.userId`.

**Test:** Log in, hammer an authenticated endpoint past `RATE_LIMIT_PER_USER_PER_MINUTE` from the same account — confirm the 429 triggers based on the account, not shared IP (e.g. two different accounts from behind the same NAT/IP no longer throttle each other). Check logs show a real `userId` value for a normal (non-admin) authenticated request.

---

## BUG 4 (Medium) — Redundant double session-token generation in device-enforcement login path

**File:** `Backend/src-new/domain/services/AuthDomainServiceImpl.ts`, method `establishAuthenticatedSession`

**Root cause:** When device enforcement is on:
1. Line ~35: generates token A, reserves it atomically via `setSessionForDeviceAtomic` (SET NX) — this is the TOCTOU-safe concurrency guard.
2. Line ~43: generates a **second, unrelated** token B and saves *that* one to `sessionRepo` — token A is never persisted anywhere else.
3. Line ~55: `replaceSessionForDevice(...)` unconditionally overwrites the Redis device-session key from token A → token B, returning token A as "old token".
4. Line ~58-59: deletes token A from `sessionRepo` — a no-op, since token A was never saved there in the first place.

Not exploitable (the final state is consistent — device key ends up correctly pointing at token B, which matches the session actually returned to the client), but it's dead work: an extra `generateSecureToken` call and extra Redis round-trips every single login/register with device enforcement on, for no behavioral benefit.

**Fix:** Generate the token once and reuse it for both the atomic reservation and the saved session — drop the second generation and the pointless replace/delete step:

```ts
async establishAuthenticatedSession(user: User, request: { ip: string; headers: { "user-agent": string } }): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  hasActiveSession?: boolean;
  user?: User;
  sessionToken?: string;
}> {
  const sessionToken = generateSecureToken(LIMITS.SESSION_TOKEN_BYTES);
  let fingerprint: DeviceFingerprint | undefined;

  if (isDeviceEnforcementEnabled()) {
    fingerprint = DeviceFingerprint.create(request);
    const result = await this.deviceSessionRepo.setSessionForDeviceAtomic(user.id, fingerprint.value, sessionToken);
    if (!result.success) {
      return { ok: false, status: 403, error: "Device already has active session", hasActiveSession: true };
    }
  }

  await this.sessionRepo.save(Session.create({
    userId: user.id,
    token: sessionToken,
    deviceFingerprint: fingerprint ? fingerprint.value : null,
    ip: request.ip,
    userAgent: request.headers["user-agent"],
  }));

  if (fingerprint) {
    await this.deviceRepo.bind(Device.create({ userId: user.id, fingerprint: fingerprint.value }));
  }

  return { ok: true, user, sessionToken };
}
```

Note: `setSessionForDeviceAtomic` already fully reserves the device→token mapping in step 1 (it's the atomic NX set) — there is nothing left for `replaceSessionForDevice` to correct, so it can be dropped from this path entirely. `replaceSessionForDevice` is still used elsewhere (kept as-is); only this call site changes.

**Test:** With `DEVICE_ENFORCEMENT=true`, log in once — confirm exactly one `SET ... NX` and no subsequent overwrite happens (check Redis command log or add a temporary log line), and that the returned `sessionToken` matches what's actually stored at `device_session:{userId}:{fingerprint}`.

---

## Not a bug — explicitly confirmed by Arman

- **`FinnhubClient` idle at startup** — intentional. Finnhub is scoped to news provider only in `src-new`, not live price ticks. No action needed.

## Noted but not required to fix (cosmetic / low severity, optional)

- `bootstrap/container.ts` registers use-cases under string tokens (`container.register("RegisterUseCase", ...)`) that are never resolved by string anywhere (controllers use `container.resolve(RegisterUseCase)` by class). Dead registrations, harmless. Safe to delete if doing cleanup, not required.
- `AiGatewayClient.streamModel()` labels every `AbortError` as `"AI provider timeout after Xms"`, even when the abort came from `params.signal` (client closed the connection) rather than the internal timeout controller. Not functionally broken, just makes gateway timeout logs/metrics unreliable. Fix only if you care about that log accuracy — distinguish by checking `timeoutController.signal.aborted` vs `params.signal?.aborted` before choosing the error message.

## Apply order

Bug 1 → Bug 2 (depends on Bug 1) → Bug 3 → Bug 4. Bug 3 and Bug 4 are independent of the others and each other.
