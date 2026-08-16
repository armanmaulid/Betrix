# Frontend — Vite (Architectured) — Code Review Report

**Scope:** `D:/Betrix/Frontend - Vite (Architectured)`
**Stack:** React 19 · Vite · TypeScript · Tailwind · TanStack Query · Zustand · SSE streaming
**Date:** 2026-08-16
**Method:** 4 parallel review passes (core+layout, auth+security, market/chat/news/user, analysis+shared lib)

---

## 1. Executive summary

Architecture is sound — clean feature-first layout (`src/features/*`, `src/shared`, `src/app/layout`), correct use of TanStack Query + Zustand + React 19 idioms. But there are **5 high-severity bugs** that will bite in production: a broken SSE `done` parser, a session-shape mismatch that corrupts history, token leakage via query-string + `localStorage`, an unmemoized auth context causing a callback re-fire loop, and a `TradingViewWidget` that leaks `<script>` tags and can remount every render.

| Severity | Count |
| --- | --- |
| High | 9 |
| Medium | 19 |
| Low | 31 |

---

## 2. High — fix first

### 2.1 SSE `done` event lost on chunk split
**`src/features/chat/api/chatClient.ts:46-73`**

`let isDoneEvent = false` is declared *inside* the `while(true)` read loop, so it resets on every `reader.read()` iteration. If `event: done` and `data: {...}` arrive in separate network chunks, the flag is lost → `onDone` never fires → `isStreaming` stuck `true` forever, message never finalizes. No `\r\n` handling.

**Fix:** hoist `isDoneEvent` outside the loop; buffer and parse on `\n\n` frame boundaries.

### 2.2 Session shape mismatch — history corrupt
**`src/features/chat/hooks/useChatStream.ts:140-151`** vs **`src/features/chat/components/ChatHistoryList.tsx:91-96`**

Writer emits `{session_id, created_at}` (snake_case); reader consumes `session.sessionId`, `session.createdAt`, `session.turns`. Result: fresh sessions render `key={undefined}`, `timeAgo(undefined)` → `"NaNd ago"`, and clicking loads `setCurrentSessionId(undefined)`.

**Fix:** one canonical camelCase shape shared between the two.

### 2.3 Token in SSE URL query string
**`src/features/auth/context/AuthContext.tsx:69`** · **`src/features/market/hooks/useTickerPrices.ts:71`**

`EventSource(...?token=${token})` puts the session token in the URL → leaks to server/proxy access logs, browser history, and `Referer` on subsequent requests. (SSE can't set headers — but that doesn't make it safe.)

**Fix:** cookie (httpOnly) or short-lived one-time ticket exchanged for the stream.

### 2.4 Token in `localStorage` + weakened CSP
**`src/features/auth/context/AuthContext.tsx:11,26,112`** · **`index.html:7`**

Token in `localStorage` is XSS-exfiltratable, and CSP allows `script-src 'unsafe-inline'` — so the XSS shield is already compromised. Acceptable SPA tradeoff *only* if no `dangerouslySetInnerHTML` exists repo-wide (verified: none in the reviewed files; confirm repo-wide).

**Fix:** httpOnly cookie session, or harden CSP (drop `unsafe-inline`).

### 2.5 `AuthCallbackPage` re-fire loop
**`src/features/auth/pages/AuthCallbackPage.tsx:30`** · **`src/features/auth/context/AuthContext.tsx:139`**

`AuthContext` value object is not memoized, so `loginWithToken` gets a new identity every provider render. `processToken()` → `setSessionToken`/`setUser` → provider re-render → new fn identity → effect re-fires → `fetchMe` → `setUser` → … loop until `navigate("/")` unmounts. Slow network = repeated token processing.

**Fix:** `useMemo` the context value (with stable callbacks); narrow the effect deps.

### 2.6 `loginWithToken` leaves stale token on failure
**`src/features/auth/context/AuthContext.tsx:117-122`**

Token written to `localStorage` + `setSessionToken` *before* `fetchMe`. On throw, token/user never cleared → invalid token persists in-session (self-heals only on reload via `restoreSession`). Callback page shows error but stale token remains stored.

**Fix:** clear on catch, or write token only after successful `fetchMe`.

### 2.7 `TradingViewWidget` — remount storm + script leak
**`src/features/market/components/TradingViewWidget.tsx:137,126,53`**

- `onError` is in the effect dependency array — an inline arrow from a parent re-runs the effect every render → full widget remount + a new `<script>` appended each render. Potential infinite loop if `onError` triggers parent state.
- The `<script>` appended to `document.head` is never removed on cleanup → every symbol/theme change leaks a tag; stale `script.onload` can fire on the new container (race with `scriptLoadedRef` reset).

**Fix:** stabilize `onError` (ref) or remove from deps; remove/GC the injected script on cleanup.

### 2.8 Duplicate Vite configs — silent edit trap
**`vite.config.ts` + `vite.config.js` + `vite.config.d.ts`**

Vite resolves `vite.config.js` first; `.ts` is silently ignored and `.d.ts` is stale. Editing `.ts` does nothing at build time.

**Fix:** delete `vite.config.js` + `vite.config.d.ts`.

### 2.9 Stray destructive script
**`src/features/analysis/pages/refactor_analyze.py`**

Targets the wrong project (`D:\Betrix\Frontend - Client\...`) and, on run, destructively rewrites `AnalyzePage.tsx` — slices at `export function AnalyzePage() {` and replaces the body with a hardcoded copy (reintroduces removed `isStreaming`/role-props, drops trailing exports).

**Fix:** delete. Never run.

---

## 3. Medium

### Auth
- **`AuthContext.tsx:124-136`** — `logout()` awaits `authApi.logout()` *before* clearing local state, no timeout → a hung request blocks sign-out indefinitely. Fix: clear state synchronously, fire-and-forget the API call.
- **`LoginPage.tsx:115` / `RegisterPage.tsx:133`** — Google OAuth via `window.location.href` with no `state`/PKCE on the frontend; CSRF protection depends entirely on backend. Verify backend implements `state` validation.
- **`marketClient.ts:19-22`** — 401 handler does `localStorage.removeItem` + `window.location.href="/login"` (full reload), bypassing context (user state not cleared, streams not closed). Inconsistent with the normal `logout()` path.
- **`useTickerPrices.ts:26-27,40-47`** — `onLogout` resets `activeSymbolRefs` but not `currentPrices`/`globalBaseData`; a second user on the same SPA sees the previous user's prices until refetch.

### Chat
- **`chatClient.ts`** — `streamChat` has no `AbortSignal`; unmount/navigate during streaming leaves fetch+reader running, no cancel path exposed.
- **`useChatStream.ts:204-206`** — `result.latencyMs / 1000` renders `"NaNs"` when backend omits `latencyMs`; same for missing `modelUsed`. Guard or default.
- **`ChatHistoryList.tsx:94`** — session load on a `<span onClick>`, not a `<button>` → not keyboard/focus accessible.

### Market
- **`useTickerPrices.ts:112`** — shared module-level `EventSource` closed only when ticker consumers unmount. News/calendar-only consumers (`NewsFeed`, `NewsPage`, `EconomicCalendar`) never decrement the refcount → connection leaks forever.
- **`useTickerPrices.ts:106`** — `globalEventSource.onerror` empty: no 401 handling, no manual reconnect fallback; a dead stream stays silently dead.
- **`LightweightChartWidget.tsx:26`** — `textColor: "var(--text-label)"` passed to lightweight-charts; canvas doesn't resolve CSS vars → text color invalid/fallback. Resolve via `getComputedStyle` or pass a hex.
- **`EconomicCalendar.tsx`** — `filtered` recomputed every render, `EventRow` not memoized; every `calendar_update` → `setQueryData` re-renders all rows.
- **`EconomicCalendarPage.tsx:164,244-245`** — `load()` no AbortSignal → rapid period-tab clicks cause out-of-order overwrite; `periodRange` new object + `nowMs = Date.now()` every render defeat the `filtered`/`stats` memos (recompute every render).

### News
- **`NewsPage.tsx:73,86-99`** — `fetchInitial`/`loadMore` no cancellation (stale overwrite on fast tab switch); `loadMore` uses `items.length` as `offset` but SSE prepends/dedupes into `items` → offset drifts, duplicate/missing pages.
- **`NewsPage.tsx:148-152`** — `wireItems` grows unbounded via SSE prepend, no 50-cap (unlike `NewsFeed`). Long-session memory growth.
- **`NewsFeed.tsx:61,188-192`** — `load()` no abort/ignore (setState after unmount); `stripHtml` runs `DOMParser` twice per item per render.

### Architecture / duplication
- **`BACKEND_URL` duplicated in 8 files** (`authClient`, `chatClient`, `newsClient`, `marketClient`, `usageClient`, `useTickerPrices`, `StatusBar`, `AuthContext`); Vite `/api` proxy is dead config (all clients use absolute `VITE_API_URL || http://localhost:3000` + `/api/v1`). Centralize to one module.
- **Two calendar implementations** (`EconomicCalendar.tsx` panel vs `EconomicCalendarPage.tsx` page) duplicate `COUNTRY_NAMES`, `flagEmoji`, `countryLabel`, `getPeriodRange`, `formatTime/Date/Value`, filter state, `EventRow` flash effect.
- **`stripHtml` + `formatRelativeTime` duplicated** in `NewsFeed.tsx` and `NewsPage.tsx`.
- **`queries.ts:10`** — `Parameters<typeof login>[0] extends undefined ? any : any` is always `any`; type safety lost, `mutationFn` returns void so mutation `data` is meaningless.
- **`authClient.ts:64`** — `body?.error` cast to `AuthApiError.message`; a non-string server error → `setState(object)` → React "Objects are not valid as a React child" crash.

---

## 4. Low

### React anti-patterns
- **`AnalyzePage.tsx:186`** — `key={idx}` on a streaming/growing list; index keys break reconciliation on insert/delete and drop component state (`isCopied`).
- **`ChatMessageItem.tsx:6`** — `React.memo` with `msg: any`; new object identity on every token flush → memo never hits. Useless.
- **`useVisibilityPoll.ts:9`** — `fnRef.current = fn` written during render; move to effect or accept the "latest ref" pattern deliberately.
- **`TopBar.tsx:30-33`** — 1s interval re-renders the whole `TopBar` every second.
- **`DashboardPage.tsx:31-36`** — effect deps `[searchParams]` but reads `symbol` state; derive `symbol` from URL instead of mirroring into state (two sources of truth).
- **`AnalyzePage.tsx:33-35,31,191`** — dead empty effect; `messagesEndRef` declared but never used (autoscroll disabled).
- **`AnalyzePage.tsx:58`** — `URL.revokeObjectURL(url)` synchronously after `a.click()`; can abort the download in Firefox. Wrap in `setTimeout`.

### Accessibility
- **`LoginPage.tsx:162-167` / `RegisterPage.tsx:208-213` / `AuthCallbackPage.tsx:47-49`** — error blocks use plain `<div>`/`<span>`, no `role="alert"`/`aria-live`; screen readers won't announce.
- **`SettingsPage.tsx:202-227,335-401`** — inputs have preceding `<label>` text but no `htmlFor`/`id` association.
- **`ChatCommandBox.tsx:211-222`** — Leaf/Globe tier buttons use `title` only, no `aria-label` (icon-only).
- **`TopBar.tsx:87-93`** — credits indicator is a `<div>` with `cursor-pointer`, not focusable; non-interactive anyway.
- **`LoginPage.tsx:118` / `RegisterPage.tsx:136`** — inline Google SVG lacks `aria-hidden`.
- **`index.html:2`** — `<html lang="id">` but large parts of UI are English → screen-reader language mismatch.
- **`StrategyPanel.tsx:128-142`** — chips lack `aria-pressed`/role state (dead component anyway).
- **`ChatCommandBox.tsx:39`** — native `alert()` for oversized image; use inline error.
- **`TickerStrip`** — decorative marquee not `aria-hidden`.

### Type safety
- **`AuthLayout.tsx:1`** and **`TradingViewWidget.tsx:1`** — `// @ts-nocheck` disables typing on whole files; `TradingViewWidget` is the most error-prone file.
- **`useChatStore.ts`** — `messages: any[]`.
- **`analyzePageHelpers.tsx:6-19`** — `markdownComponents` render fns typed `(props: any)`; type as `Components` from `react-markdown`.
- **`tradingViewSymbols.ts:29`** — fallback emits invalid `OANDA:${mt5Symbol}` for unmapped/lowercase input (lookup is case-sensitive); normalize input to uppercase.
- **`analyzePageHelpers.tsx:82,98`** — `Record<string, ...>` loose keys on `FRONTEND_TASK_TIER_MAP`/`TAB_TO_NEWS_ASSETS`.

### Dead code / stray
- Dead components: **`StrategyPanel.tsx`**, **`SignalResultCard.tsx`**, **`LightweightChartWidget.tsx`** (TradingViewWidget used instead).
- Dead fns: `usageClient.getMessages`/`sendMessage`/`Message`, `useLogoutMutation`.
- Dead state: `webSearchEnabled` (`useChatStore.ts:22`), `VITE_ALPHA_VANTAGE_API_KEY`, `VITE_MT5_BRIDGE_URL` (`vite-env.d.ts:4-5`).
- Stray: `refactor_analyze.py` (see 2.9).

### Cosmetic / misc
- **`AuthLayout.tsx:148,155,163`** — `z-5` is not a default Tailwind class (z-0/10/20…), silently no-op.
- **`index.css`** — global `button { position:relative; overflow:hidden }`, `* { transition:100ms !important }`, `border-radius:0 !important` on all controls → clobbers any component needing rounded/absolute children and custom transitions.
- **`StatusBar.tsx:65,72`** — hardcoded dummy "142 KB / 12 KB", "MARKET: OPEN (NY)".
- **`AuthLayout.tsx:47`** — static `toLocaleTimeString` rendered once, no interval.
- **`SignalResultCard.tsx:20-22`** — `formatPrice` `toFixed(4)` hardcoded (wrong for JPY/crypto).
- **`NewsPage.tsx:245,333`** — `rel="noreferrer"` only; add explicit `noopener`.
- **`analyzePageHelpers.tsx:98-103`** — comment says "AUTO tidak dipetakan" but code maps `AUTO: ["usd"]` (doc/code contradiction).
- **`analyzePageHelpers.tsx:39`** — `symbolRaw.replace(/^\/+/, '')` dead (regex can't match).

---

## 5. Recommended fix order

1. **Delete** `refactor_analyze.py`, `vite.config.js`, `vite.config.d.ts`.
2. **Fix SSE done-event buffer** (`chatClient.ts:46-73`) — real correctness bug.
3. **Fix session shape mismatch** (`useChatStream` ↔ `ChatHistoryList`) — real correctness bug.
4. **`TradingViewWidget`** — stabilize `onError` dep + remove injected `<script>` on cleanup.
5. **Memoize `AuthContext` value**; clear token on `fetchMe` throw.
6. **Move token off query string** (cookie / one-time ticket).
7. **Add `AbortSignal`** to chat/calendar/news fetches; fix shared SSE refcount leak.
8. **Centralize `BACKEND_URL`**; delete dead `/api` proxy.
9. **A11y pass** — `role="alert"`, label association, button semantics.
10. **Delete dead components/fns/state**; remove `@ts-nocheck` where feasible.
