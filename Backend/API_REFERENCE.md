# Betrix Backend — API Reference

Full request/response reference for frontend wiring. Generated from the actual Zod DTOs, controllers, and entities in `src/` (not hand-written docs) — if behavior ever looks different from this doc, the source under `src/application/dtos/`, `src/presentation/controllers/`, and `src/domain/entities/` is the source of truth.

- **Base URL (dev)**: `http://localhost:3000/api/v1`
- **Base URL (prod)**: Railway deployment URL + `/api/v1` (ask backend for the current URL — it's not hardcoded anywhere in the repo)
- **Content-Type**: `application/json` for all requests except file exports
- **CORS**: only origins listed in `ALLOWED_ORIGINS` (default `http://localhost:5173,http://localhost:5174`) are allowed. If your dev server runs on a different port, ask backend to add it.

---

## 1. Auth model

Every protected route expects:

```
Authorization: Bearer <sessionToken>
```

`sessionToken` is the opaque string returned by `POST /auth/login` (or `register`, or the Google OAuth callback). It is **not** a JWT you can decode client-side — treat it as an opaque token and store it (e.g. secure storage / httpOnly-equivalent for web).

**SSE exception**: browsers' native `EventSource` can't set custom headers, so the two streaming endpoints (`GET /chat/stream` is POST-only via fetch, but `GET /news/stream` uses `EventSource`) accept the token as a query param instead:

```
GET /api/v1/news/stream?token=<sessionToken>
```

Unauthenticated request → `401`:
```json
{ "error": "Session token required", "code": "UNAUTHENTICATED" }
```
Invalid/expired token → `401`:
```json
{ "error": "Session not found or expired", "code": "UNAUTHENTICATED" }
```

`guestMiddleware` (used on `/auth/register` and `/auth/login`) rejects the call with `400 ALREADY_AUTHENTICATED` if a valid token is already attached — don't call these two while a session is active.

---

## 2. Error envelope (applies to every endpoint)

All errors — validation, auth, not-found, rate limit, server — return this shape:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_CODE",
  "details": { "...optional, present for validation errors" },
  "requestId": "..."
}
```

`code` is always one of:

| code | HTTP status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod validation failed — check `details` |
| `UNAUTHENTICATED` | 401 | Missing/invalid/expired session token |
| `FORBIDDEN` | 403 | Authenticated but not allowed (e.g. non-admin hitting `/admin/*`) |
| `INSUFFICIENT_CREDITS` | 402 | Not enough credits for an AI chat call |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | e.g. duplicate email on register |
| `RATE_LIMITED` | 429 | Too many requests — see rate limit env vars |
| `INTERNAL_ERROR` | 500 | Unexpected error (message is generic in production) |
| `SERVICE_UNAVAILABLE` | 503 | Downstream dependency down |

Build one shared error handler on the frontend keyed off `code`, not `error` (the message string can change).

---

## 3. Auth (`/auth`)

### `POST /auth/register` — public
```json
// Request
{ "email": "user@example.com", "password": "min8chars", "name": "Optional Name" }
```
```json
// 201 Response
{
  "message": "Registration processed. Please check your email.",
  "sessionToken": "...",          // present only if email verification isn't required
  "user": { /* User object, see §8 — only present if sessionToken is present */ }
}
```
If `REQUIRE_EMAIL_VERIFICATION=true`, `sessionToken`/`user` are omitted and the user must verify first.

### `POST /auth/login` — public
```json
// Request
{ "email": "user@example.com", "password": "..." }
```
```json
// 200 Response
{ "sessionToken": "...", "user": { /* User object */ } }
```

### `GET /auth/google` — public
Redirects into Google OAuth consent flow (`scope: profile,email`). Don't call via fetch — navigate the browser to this URL directly.

### `GET /auth/google/callback` — public (Google redirects here)
On success, redirects the browser to:
```
{FRONTEND_URL}/auth/callback?token=<sessionToken>
```
On failure, redirects to `{FRONTEND_URL}/login?error=google_denied` or `?error=session_failed`. Frontend needs an `/auth/callback` route that reads `?token=` and stores it.

### `POST /auth/logout-by-credentials` — public
```json
// Request
{ "email": "...", "password": "..." }
```
```json
// 200 Response
{ "message": "Logout berhasil" }
```

### `POST /auth/logout` — auth required
No body. → `{ "message": "Logout berhasil" }`

### `POST /auth/logout-all` — auth required
Revokes every session/device for the user. No body. → `{ "message": "Logout dari N device berhasil" }`

### `GET /auth/verify-email?token=...` or `POST /auth/verify-email` — public
```json
// Body (if POST)
{ "token": "..." }
```
→ `{ "message": "Email verified successfully" }`

### `POST /auth/resend-verification` — public
```json
{ "email": "user@example.com" }
```
→ `{ "message": "Verification email sent" }`

### `PUT /auth/password` — auth required
```json
{ "currentPassword": "...", "newPassword": "min8chars" }
```
→ `{ "message": "Password changed successfully" }`

### `PUT /auth/email` — auth required
```json
{ "currentPassword": "...", "newEmail": "new@example.com" }
```
→ `{ "message": "Confirmation email sent to new address", "pendingEmail": "new@example.com" }`
(Email doesn't actually change until the confirmation link is used.)

### `GET /auth/me` — auth required
→ `{ "user": { /* User object */ } }`

### `PUT /auth/profile` — auth required
```json
// All fields optional
{
  "name": "New Name",
  "phone": "+62...",
  "address": "...",
  "birthdate": "1990-01-01",       // date string YYYY-MM-DD
  "gender": "male",                 // "male" | "female" | "other"
  "bio": "..."
}
```
→ `{ "user": { /* updated User object */ } }`

### `GET /auth/sessions` — auth required
→ `{ "sessions": [ /* Session objects, see §8 — includes deviceFingerprint/ip/userAgent for a "manage devices" UI */ ] }`

### `DELETE /auth/sessions/:fingerprint` — auth required
Revokes one device/session by its fingerprint. → `{ "message": "Session revoked" }`

---

## 4. Chat (`/chat`) — all auth required

Task types (`taskType`): `general` | `trade_reasoning` | `risk_narrative` | `market_insight` | `quick_summary` | `classify_signal`
Model tiers (`tier`, optional — server picks a default per task type if omitted): `cheap` | `balanced` | `deep`

### `POST /chat`
```json
// Request
{
  "message": "What's the outlook for EURUSD?",
  "taskType": "market_insight",          // default "general"
  "displayMessage": "optional — what to show in UI history instead of `message`",
  "history": [                             // optional, max 20 turns
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "sessionId": "uuid — optional, continues an existing chat session",
  "tier": "balanced",                     // optional
  "image": "optional base64 or URL — vision input"
}
```
```json
// 200 Response
{
  "reply": "AI's answer text",
  "modelUsed": "model-identifier-string",
  "latencyMs": 842,
  "usage": { "inputTokens": 120, "outputTokens": 340 }   // or null
}
```
`402 INSUFFICIENT_CREDITS` if the user's credit balance can't cover the tier's cost.

### `POST /chat/stream` — Server-Sent Events
Same request body as above. Response is `text/event-stream`, **not** JSON — consume with `fetch` + a `ReadableStream` reader (not `EventSource`, since this is POST). Events:
```
data: {"token":"partial "}

data: {"token":"text chunk"}

event: done
data: {"modelUsed":"...","latencyMs":842,"usage":{"inputTokens":120,"outputTokens":340}}
```
On failure mid-stream:
```
event: error
data: {"error":"Failed to stream message"}
```
Accumulate `token` fields in order until the `done` event; treat `done`'s payload the same as the non-streaming response's metadata.

### `GET /chat/history`
Query: `limit` (1–100, default 50), `offset` (default 0), `taskType`, `startDate` (`YYYY-MM-DD`), `endDate` (`YYYY-MM-DD`)
```json
// 200 Response
{
  "data": [
    {
      "sessionId": "uuid",
      "sessionStart": "2026-08-01T10:00:00.000Z",
      "createdAt": "2026-08-01T10:05:00.000Z",
      "title": "Auto-generated session title",
      "turns": [
        { "message": "...", "reply": "...", "modelUsed": "...", "latencyMs": 842 }
      ]
    }
  ],
  "pagination": { "total": 42, "limit": 50, "offset": 0, "hasMore": false }
}
```

### `DELETE /chat/session/:sessionId`
`sessionId` must be a UUID. → `{ "message": "Session deleted" }`

### `GET /chat/export`
Query: `format` (`json` | `csv`, default `json`), `taskType`, `startDate`, `endDate`.
Returns a file download (`Content-Disposition: attachment`), not JSON — trigger a browser download rather than `res.json()`.

---

## 5. Market (`/market`) — all auth required

### `GET /market/symbols`
Query: `category` (optional), `activeOnly` (default `true`)
```json
{ "symbols": [ { "symbol": "EURUSD", "description": "Euro vs US Dollar", "path": "Forex\\Majors", "category": "forex", "isActive": true, "createdAt": "...", "updatedAt": "..." } ] }
```

### `GET /market/symbols/:symbol`
Same single object as one entry above, or `404 NOT_FOUND`.

### `GET /market/symbols/category/:category`
```json
{ "symbols": [ /* BrokerSymbol objects, same shape */ ] }
```

### `GET /market/calendar`
Query: `fromDate`, `toDate` (`YYYY-MM-DD`), `country`, `currency`, `importance` (`none`|`low`|`medium`|`high`), `limit` (default 100)
```json
{
  "events": [
    {
      "valueId": 123, "eventId": 456,
      "eventTime": "2026-08-15T12:30:00.000Z",
      "country": "US", "currency": "USD",
      "eventName": "Non-Farm Payrolls",
      "importance": "high",
      "actual": null, "forecast": "180K", "previous": "175K",
      "createdAt": "...", "updatedAt": "..."
    }
  ]
}
```

### `GET /market/prices/:symbol`
```json
{ "symbol": "EURUSD", "bid": 1.0851, "ask": 1.0853, "spread": 0.0002, "digits": 5, "volume": 12, "timestamp": 1755000000000 }
```
`404 NOT_FOUND` if no live tick is cached yet for that symbol.

### `GET /market/prices?symbols=EURUSD,GBPUSD`
```json
{ "prices": { "EURUSD": { /* tick object */ }, "GBPUSD": { /* tick object */ } } }
```
`symbols` query param is **required**.

### `GET /market/prices/all`
```json
{ "prices": { "EURUSD": { /* tick */ }, "...": { } } }
```

### `GET /market/ohlc/:symbol/:timeframe`
`timeframe` e.g. `M1`, `M5`, `H1`, `D1` (uppercased server-side).
```json
{ "symbol": "EURUSD", "timeframe": "H1", "time": 1755000000, "open": 1.0840, "high": 1.0860, "low": 1.0835, "close": 1.0851, "volume": 3200, "prev_close": 1.0838 }
```

### `GET /market/ohlc/all?timeframe=H1`
```json
{ "ohlc": { "EURUSD": { /* OHLC object */ }, "...": {} } }
```
`timeframe` query param is **required**.

### `GET /market/mbook/:symbol` and `GET /market/mbook/all`
Depth-of-market. Single:
```json
{ "symbol": "EURUSD", "bids": [ { "price": 1.0850, "volume": 5 } ], "asks": [ { "price": 1.0852, "volume": 3 } ] }
```
All: `{ "marketBooks": { "EURUSD": { /* same shape */ } } }`
> Note: market book tracking is off by default (`MT5_TRACK_MBOOK=false`) — expect empty results unless backend has enabled it.

---

## 6. News (`/news`) — all auth required

### `GET /news`
Query: `asset` (optional — one of `usd, eur, gbp, jpy, metal, oil, btc, eco, global, crypto`), `limit` (default 30, max 100), `offset` (default 0)
```json
{
  "news": [
    {
      "id": "uuid", "source": "Finnhub", "title": "...",
      "url": "https://...", "summary": "...",
      "assetTags": ["usd", "eco"],
      "publishedAt": "2026-08-12T08:00:00.000Z"
    }
  ]
}
```
Invalid `asset` value → `400 VALIDATION_ERROR` with the list of allowed values in the message.

### `GET /news/stream` — Server-Sent Events (`EventSource`-compatible)

> **This is the single realtime channel for the whole app — not just news.** There is only one SSE connection type in this backend (`SseNotifier`), and `/news/stream` is the only route that opens it. Every `broadcastGlobal`/`broadcastToUser` call anywhere in the backend — market ticks, OHLC, market book, calendar, credits, forced logout — rides over this **same** connection. **There is no separate stream for price ticks, OHLC, or calendar** — don't build a second `EventSource` expecting one; open `/news/stream` once and route every event below off it.

Auth via query param since `EventSource` can't set headers:
```js
const es = new EventSource(`${BASE_URL}/news/stream?token=${sessionToken}`);
```

Events you'll receive on this one connection:

| event | payload | when | gated by |
|---|---|---|---|
| `connected` | `{"status":"ok"}` | immediately on connect | — |
| `news_update` | array of new `NewsArticle` objects (same shape as `/news` items) | new articles polled in | — |
| `price_update` | `{ symbol, bid, ask, spread, digits, volume, timestamp }` — same shape as one entry from `GET /market/prices` | on every live tick from the MT5 bridge | `MT5_TRACK_PRICES=true` **and** the symbol is in `MT5_TRACKING_SYMBOLS` — ticks for any other symbol are cached server-side but never pushed |
| `ohlc_update` | `{ symbol, timeframe, time, open, high, low, close, volume, prev_close }` | on every closed/updated candle from the MT5 bridge | `MT5_TRACK_OHLC=true` and symbol in `MT5_TRACKING_SYMBOLS` |
| `mbook_update` | `{ symbol, bids: [{price,volume}], asks: [{price,volume}] }` | on depth-of-market change | `MT5_TRACK_MBOOK` — **defaults to `false`**, so don't expect this event to fire in most environments unless backend has explicitly enabled it |
| `calendar_update` | full `CalendarEvent` object (same shape as one entry from `GET /market/calendar`) | when an economic calendar event's actual/forecast/previous value changes live | `MT5_TRACK_CALENDAR=true` |
| `credits_update` | `{"credits": number}` | user's credit balance changed (chat spend/refund/admin grant) | user-scoped — only the affected user's connections get it |
| `logout` | `{"reason": "..."}` | an admin forced logout on this session (e.g. ban, password reset) | user-scoped — frontend should clear the session and redirect to login |
| `evicted` | `{"reason":"max_connections_reached"}` | this tab's connection was dropped because the user has 5+ open SSE connections already | — |

Practical notes for wiring this up:
- **Symbol scope**: `price_update`/`ohlc_update`/`mbook_update` only ever fire for symbols listed in the backend's `MT5_TRACKING_SYMBOLS` env var (currently the 12-symbol default list — ask backend for the live value if you need to know exactly which symbols stream vs. need polling). Anything outside that list must be polled via `GET /market/prices/:symbol` / `GET /market/ohlc/:symbol/:timeframe` — there's no way to request additional symbols be streamed from the client side.
- **One connection, filter client-side**: since `news_update`, `price_update`, `ohlc_update`, `calendar_update`, `credits_update`, and `logout` all arrive on the same `EventSource`, register a listener per event name (`es.addEventListener("price_update", ...)`, etc.) rather than trying to distinguish by payload shape.
- **No `mbook_update` in practice today**: unless backend confirms `MT5_TRACK_MBOOK=true` in the environment you're pointed at, build the order-book UI against `GET /market/mbook/*` polling, not the stream.
- **Reconnect**: `EventSource` auto-reconnects on drop, but the token is baked into the URL — if the session token changes (e.g. user logs out/in), you must close and re-open with the new token; the browser won't do that for you.

---

## 7. User (`/me`) — all auth required

### `GET /me/activity`
Query: `page` (default 1), `limit` (default 25, max 100), `action`, `from`, `to` (dates)
```json
{
  "activities": [ { "id": "...", "action": "login", "details": {}, "ip": "...", "timestamp": "..." } ],
  "pagination": { "page": 1, "limit": 25, "total": 10, "totalPages": 1 }
}
```

### `GET /me/usage/me` and `GET /me/usage/current-month` (alias, same handler)
Query: `days` (default 30)
```json
{
  "period": "Last 30 days",
  "summary": {
    "requestCount": 42, "totalInputTokens": 5000, "totalOutputTokens": 8000,
    "totalTokens": 13000, "avgLatencyMs": 780,
    "firstRequest": "...", "lastRequest": "..."
  },
  "byTaskType": [ { "taskType": "market_insight", "requestCount": 20, "totalTokens": 6000 } ],
  "dailyUsage": [ { "date": "2026-08-01", "requestCount": 3, "totalTokens": 900 } ]
}
```

### `GET /me/messages` (inbox)
Query: `limit` (default 50), `offset`, `unread` (`"true"`/`"false"`), `search`
```json
{
  "messages": [
    {
      "id": "uuid", "subject": "...", "body": "...",
      "readAt": null, "createdAt": "...", "threadId": "uuid",
      "from": { "id": null, "email": "system@betrix", "name": "Betrix" },
      "to": { "id": "uuid", "email": "user@example.com", "name": "User" }
    }
  ],
  "unreadCount": 3,
  "total": 12
}
```
`from.id: null` means it's a system message (not from another user).

### `GET /me/messages/sent`
Same shape as inbox but sender's own sent messages (no `unreadCount`).

### `GET /me/messages/thread/:threadId`
Full thread (array of messages in the same shape as above).

### `GET /me/messages/:id`
Single message detail (same object shape).

### `POST /me/messages/:id/read`
Marks read. Returns the updated message object.

### `DELETE /me/messages/:id`
Soft-deletes. Returns confirmation object from the use-case.

### `POST /me/messages`
```json
{ "toEmail": "recipient@example.com", "subject": "...", "body": "...", "replyToMessageId": "uuid (optional)" }
```
→ `201` with the created message object.

### `GET /me/messages/preferences` and `POST /me/messages/preferences`
```json
// POST body
{ "emailEnabled": true }
```
→ `{ "message": "Preferences updated" }`
> Note: `GET` on this path currently routes to the same update handler in the backend rather than a read — expect this endpoint to not actually return current preferences yet. Flag this with backend if the frontend needs to display the current toggle state.

---

## 8. Shared object shapes

### User
```json
{
  "id": "uuid", "userId": "uuid",       // same value, both keys present
  "email": "user@example.com", "name": "...",
  "isAdmin": false, "status": "active",  // "active" | "banned" | "suspended"
  "emailVerified": true, "credits": 97,
  "createdAt": "...", "lastActive": "...",
  "phone": null, "address": null, "birthdate": null, "gender": null, "bio": null,
  "googleId": null, "verifiedAt": "..."
}
```
Never contains `passwordHash` — safe to store/display as-is.

### Session (from `GET /auth/sessions`)
```json
{ "id": "uuid", "userId": "uuid", "token": "...", "createdAt": "...", "expiresAt": "...", "deviceFingerprint": "...", "ip": "...", "userAgent": "..." }
```
> `token` is included in the list response — be careful not to display other sessions' tokens in a UI; only use it to match "this device" (compare against the token you're currently using).

---

## 9. Admin (`/admin`) — auth + `isAdmin: true` required

Non-admin users get `403 FORBIDDEN` on all of these.

| Endpoint | Body / Query | Notes |
|---|---|---|
| `GET /admin/me` | — | Admin's own user detail |
| `PATCH /admin/me` | `{ status?, isAdmin? }` | Self-update (rarely used) |
| `GET /admin/users` | `page, limit, search, status, role, verified, sortBy, order` | Paginated user list |
| `GET /admin/users/:id` | — | Full user detail |
| `PUT /admin/users/:id` | `{ status?: "active"\|"banned"\|"suspended", isAdmin?: boolean }` | Triggers a `logout` SSE event to that user if changed |
| `DELETE /admin/users/:id` | — | → `{ "message": "User deleted" }` |
| `POST /admin/users/:id/reset-password` | `{ sendEmail?: boolean, default true }` | Forces logout via SSE too |
| `GET /admin/metrics` | `days` (default 30) | Platform-wide usage metrics |
| `GET /admin/analytics` | `days, fromDate, toDate` | Broader analytics breakdown |
| `GET /admin/system` | — | System/health info (DB, Redis, uptime) |
| `GET /admin/logs` | `type: "error"\|"combined", limit` | Reads Winston log files |
| `GET /admin/actions` | `page, limit, search, action, actor, actorType, from, to, order` | Audit log of admin actions |
| `GET /admin/actions/export` | same filters | File download (csv/json) |
| `POST /admin/broadcast` | `{ subject, body, recipients: "all" \| uuid[] }` | Sends a `Message` to each recipient |

Response bodies for `getUsers`/`getUserDetail`/`getMetrics`/`getAnalytics`/`getSystemInfo`/`getAuditLogs` are passed through from their use-cases largely as-is (not hand-shaped by the controller) — if the Frontend-Admin team needs exact field names for any of these, ask backend to paste the corresponding `application/use-cases/admin/*UseCase.ts` output interface, since they weren't flattened here to keep this doc from ballooning further.

---

## 10. Things frontend should build once, centrally

- **HTTP client wrapper**: attach `Authorization: Bearer` automatically, parse the `{error, code, details, requestId}` envelope on non-2xx, and redirect to login on `UNAUTHENTICATED`.
- **One SSE client for `/news/stream`**: open it once at app-shell level (not per-page), and route `news_update` / `price_update` / `ohlc_update` / `mbook_update` / `calendar_update` / `credits_update` / `logout` to their respective stores by event name. Do not open additional `EventSource` connections per page expecting a dedicated "prices" or "calendar" stream — there isn't one.
- **Chat streaming reader**: a small helper that turns the `POST /chat/stream` response body into a token-by-token callback + a final metadata object, since it's not `EventSource`-compatible.
- **Date params**: all `startDate`/`endDate`/`fromDate`/`toDate` query params are plain `YYYY-MM-DD` strings, not ISO datetimes — don't send full timestamps.
