# Frontend (Vite) — Bugfix Plan

Source: `FRONTEND_REVIEW_REPORT.md` review + manual verification against actual
source (all High-severity items + 2 Medium items confirmed against real code,
not just the report text — see verification notes per item below).

## Rules for whoever (human or agent) works this plan

1. **Work top to bottom, one phase at a time.** Don't skip ahead or batch
   multiple phases into one sitting — each phase ends with a verification
   gate that must pass before starting the next.
2. **After every phase**, run:
   ```
   npx tsc --noEmit
   npm run build
   ```
   Both must succeed (0 errors) before checking that phase's box below and
   moving on. This repo has no test suite yet — the build is the only
   automated gate, so don't skip it.
3. **Don't "improve" or reinterpret a fix.** Apply exactly what's specified.
   If a fix's approach seems wrong or you want to do it differently, stop
   and ask instead of substituting your own design — some of these
   (token storage, session shape) affect the backend contract too.
4. **One phase = one commit.** Keep phases separable so a bad phase can be
   reverted without touching the others.
5. Check off each TODO item as you complete it, in this file, so progress
   survives a context reset.

---

## Phase 0 — Cheap wins, zero risk

No logic changes, nothing to test beyond the build passing.

- [x] Delete `src/features/analysis/pages/refactor_analyze.py` — it targets a
      different project path (`D:\Betrix\Frontend - Client\...`, not this
      folder) and, if ever run, destructively rewrites `AnalyzePage.tsx`.
      Never run it, just delete it.
- [x] Delete `vite.config.js` and `vite.config.d.ts`. Vite resolves `.js`
      before `.ts`, so `vite.config.ts` (the real, maintained one) has been
      silently ignored — any edit made to `vite.config.ts` up to now had no
      effect on the actual dev/build config. After deleting, confirm
      `vite.config.ts` is the only config file left and `npm run dev` still
      boots with the `/api` proxy intact.
- [x] Delete dead components (imported nowhere, confirm with a repo-wide
      grep before deleting each): `StrategyPanel.tsx`, `SignalResultCard.tsx`,
      `LightweightChartWidget.tsx` (superseded by `TradingViewWidget`).
- [x] Delete dead exports: `usageClient.getMessages`, `usageClient.sendMessage`,
      the unused `Message` type in `usageClient`, `useLogoutMutation`.
- [x] Delete dead state: `webSearchEnabled` in `useChatStore.ts` (~line 22),
      `VITE_ALPHA_VANTAGE_API_KEY` and `VITE_MT5_BRIDGE_URL` in
      `vite-env.d.ts` (~lines 4-5) — confirm nothing reads these first.

**Verify:** `npx tsc --noEmit && npm run build` — 0 errors.

---

## Phase 1 — Correctness bugs (data is actually wrong today)

These aren't edge cases — they produce wrong output in normal use.

- [ ] **SSE `done` event lost on chunk split** — `src/features/chat/api/chatClient.ts:46-73`.
      `let isDoneEvent = false` is declared *inside* the `while(true)` read
      loop, so it resets every `reader.read()` call. If `event: done` and its
      `data:` line land in separate network chunks, the flag is gone by the
      time the data line is processed → `onDone` never fires → streaming UI
      stuck "thinking" forever.
      **Fix:** hoist `isDoneEvent` to outside the `while` loop (declare it
      once, alongside `buffer`). Also switch from `\n`-only splitting to
      `\n\n` frame-boundary parsing per the SSE spec, and handle `\r\n` line
      endings (some proxies normalize to CRLF) — don't just patch the
      variable scope and leave the parser otherwise as-is.

- [ ] **Session shape mismatch corrupts chat history UI** —
      `src/features/chat/hooks/useChatStream.ts:140-151` (writer) vs
      `src/features/chat/components/ChatHistoryList.tsx` (reader, ~91-96).
      Writer pushes `{ session_id, title, message, created_at }` (snake_case);
      reader reads `session.sessionId`, `session.createdAt`. Confirmed
      concretely broken at 3 points: `key={session.sessionId}` → `undefined`,
      `timeAgo(session.createdAt)` → `"NaNd ago"`, and clicking a session
      calls `setCurrentSessionId(session.sessionId)` → `undefined`.
      **Fix:** pick ONE canonical camelCase shape (`{ sessionId, title,
      message, createdAt }`) and use it in both places — change the writer to
      emit camelCase (don't patch the reader to accept both shapes; that just
      hides the drift for the next mismatch). Grep the whole `chat` feature
      for any other place reading `session_id`/`created_at` on this object
      before declaring this done.

**Verify:** manually start a new chat, send a message, confirm it appears in
the recent-sessions list with a real relative time (not "NaNd ago"), and
clicking it actually loads that session. Then `npx tsc --noEmit && npm run build`.

---

## Phase 2 — Auth/session security (needs care — coordinate before changing token storage)

**Stop and confirm with me before starting this phase** — items 2.1 and 2.2
change where the session token lives, which may need a matching backend
change (e.g. issuing an httpOnly cookie, or a one-time SSE ticket endpoint).
Don't silently pick an approach; the two realistic options have different
backend implications:
- **Option A (bigger change):** move the session token to an httpOnly cookie
  set by the backend on login, drop `Authorization: Bearer` entirely for
  browser requests. Fixes both the URL-leak and the localStorage/XSS issue at
  once, but touches every API client and the backend's CORS/cookie config.
- **Option B (smaller change):** keep the bearer-token model as-is for normal
  API calls, add a backend endpoint that exchanges the session token for a
  short-lived, single-use "stream ticket" used only in the SSE URL. Backend-
  only addition, frontend just swaps what it puts in the query string.

Once that's decided, do these in order:

- [ ] **Token in SSE URL query string** —
      `src/features/auth/context/AuthContext.tsx:69` and
      `src/features/market/hooks/useTickerPrices.ts:71` both do
      `new EventSource(\`${BACKEND_URL}/api/v1/news/stream?token=${token}\`)`.
      This leaks the session token into server/proxy access logs and browser
      history. Apply whichever option was decided above to both call sites —
      don't fix one and miss the other.
- [ ] **Token in `localStorage`** — `AuthContext.tsx` (`STORAGE_KEY`,
      `localStorage.getItem`/`setItem` throughout). Confirmed: no
      `dangerouslySetInnerHTML` exists anywhere in `src/` (verified
      repo-wide), so this is a lower-urgency item than it would otherwise be
      — but `index.html`'s CSP already allows `script-src 'unsafe-inline'`,
      which weakens the XSS protection this relies on. If Option A above is
      chosen this item is resolved for free; if Option B is chosen, separately
      decide whether to also harden the CSP (drop `unsafe-inline` from
      `script-src`) as a defense-in-depth measure — check whether any inline
      `<script>` in `index.html` or inline event handlers currently depend on
      it before removing it.

**Verify:** log in, confirm the chat page and ticker prices both still stream
live data with the new token-passing mechanism; log out and confirm no stale
credential remains (check dev tools → Application → Local Storage and the
Network tab's EventSource requests).

---

## Phase 3 — AuthContext re-render loop + stale token on failure

Both bugs live in the same file and are easiest to fix together.

- [ ] **`AuthContext` value not memoized → `AuthCallbackPage` re-fire loop** —
      `AuthContext.tsx:139` (`<AuthContext.Provider value={{ user, setUser,
      isLoading, isConnected, login, loginWithToken, logout }}>`) creates a
      new object AND new function identities every render. `AuthCallbackPage.tsx`'s
      effect (`useEffect(..., [token, loginWithToken, navigate])`, ~line 30)
      re-fires every time `loginWithToken`'s identity changes — which is every
      time this provider re-renders, which `loginWithToken` itself triggers by
      calling `setSessionToken`/`setUser`. Confirmed: on a slow network this
      calls `fetchMe`/processes the token multiple times before `navigate()`
      finally unmounts the page.
      **Fix:** wrap `login`, `loginWithToken`, `logout` in `useCallback` with
      correct deps, and wrap the context value object itself in `useMemo`
      keyed on the actual state/callbacks it contains. Don't just remove
      `loginWithToken` from `AuthCallbackPage`'s dep array as a shortcut —
      fix the root cause (unstable identity) so every other consumer of this
      context benefits too.
- [ ] **`loginWithToken` leaves a stale token on failure** — same file,
      `loginWithToken` (~117-122) calls `localStorage.setItem` and
      `setSessionToken(token)` *before* `await authApi.fetchMe(token)`. If
      `fetchMe` throws (expired/invalid token), nothing clears the token —
      `AuthCallbackPage`'s catch block only sets a UI error message, the
      invalid token stays in `localStorage` and in state.
      **Fix:** either move the `localStorage.setItem`/`setSessionToken` calls
      to *after* `fetchMe` succeeds, or wrap in try/catch and clear both on
      failure. Prefer the former — don't set state you might immediately have
      to unwind.

**Verify:** in dev tools, throttle network to "Slow 3G", trigger the Google
OAuth callback flow, and confirm `fetchMe`/the auth network call only fires
once (check the Network tab request count for `/api/v1/auth/me`). Then test
with a deliberately invalid `?token=` in the callback URL and confirm
`localStorage` ends up empty after the error is shown.

---

## Phase 4 — TradingViewWidget

- [ ] **Injected `<script>` never removed** —
      `src/features/market/components/TradingViewWidget.tsx`. The effect
      appends a new `<script src="https://s3.tradingview.com/tv.js">` to
      `document.head` (~line 126) on every run, but cleanup (~line 137-142)
      only does `container.innerHTML = ""` — the script tag itself is never
      removed from `<head>`. Confirmed actively happening today: the third
      widget on `DashboardPage.tsx` (~line 84-87) has a dynamic `symbol` prop
      that changes when the user switches instruments, so every switch leaks
      one more script tag.
      **Fix:** in the cleanup function, also remove the script element you
      created (keep a ref to it, `script.remove()` on cleanup) — or, simpler
      and more robust: check `document.querySelector('script[src="https://s3.tradingview.com/tv.js"]')`
      before creating a new one, and only ever load it once globally (module-
      level flag/promise), since the script itself doesn't need to reload per
      widget instance — only `initWidget()` needs to re-run per mount.
- [ ] **`onError` in the effect's dependency array** — same file, the
      effect's dep array (~line 137) includes `onError`. No current caller
      passes this prop (checked: `DashboardPage.tsx` is the only consumer, 3
      usages, none pass `onError`), so this isn't actively causing a remount
      storm *today* — but it's a landmine: the prop clearly exists to let a
      parent show a fallback chart on failure, and the moment anyone wires up
      `onError={() => ...}` as an inline arrow function, every parent render
      will remount this widget.
      **Fix:** wrap the widget's own use of `onError` in a ref
      (`onErrorRef.current = onError` in a separate effect with `[onError]`
      as its only dep, then call `onErrorRef.current?.()` inside the main
      effect) so the main effect's dep array doesn't need `onError` at all.

**Verify:** open the dashboard page, switch the traded symbol several times,
and confirm (via dev tools → Elements → `<head>`) that only one
`s3.tradingview.com/tv.js` script tag exists, not one per switch.

---

## Phase 5 — Medium: cancellation, leaks, duplication

Independent items — fine to split across multiple agent runs/sessions if
needed, unlike Phases 1-4 which build on each other.

- [ ] **Shared SSE connection refcount leak** —
      `src/features/market/hooks/useTickerPrices.ts`. `activeSymbolRefs` (a
      module-level refcount) is only touched by `useTickerPrices` itself.
      Confirmed: `NewsFeed.tsx`, `NewsPage.tsx`, `EconomicCalendar.tsx`, and
      `EconomicCalendarPage.tsx` all call `getSharedEventSource()` directly
      and never decrement anything — a user who only ever visits a news/
      calendar page (no ticker component mounted) causes the shared
      `EventSource` to open and never close for the rest of the session.
      **Fix:** give these 4 consumers the same refcounting contract
      `useTickerPrices` uses internally (increment on mount, decrement on
      unmount, close the shared source when the total count across ALL
      consumers — not just symbols — hits zero) rather than calling
      `getSharedEventSource()` as if it were side-effect-free.
- [ ] **`globalEventSource.onerror` is empty** — same file (~line 106). No
      401 handling, no reconnect fallback logic — a dead stream (e.g. after
      the token expires) just stays silently dead with no user-visible signal
      and no attempt to recover.
      **Fix:** on error, check if it's likely an auth failure (e.g. the
      backend closes with a specific status you can detect, or just always
      attempt one token refresh + reconnect), and expose some signal (a
      `isConnected`/`hasError` flag already exists in `AuthContext` — wire
      the ticker's connection health into something the UI can show, even if
      minimal).
- [ ] **No `AbortSignal` on `streamChat`** — `chatClient.ts`. Navigating away
      or unmounting mid-stream leaves the `fetch` + reader running with no way
      to cancel. Add an `AbortController`, accept an optional `signal` param
      (or return the controller so the caller can abort), and wire it into
      the `fetch()` call + cancel the reader loop on abort.
- [ ] **No `AbortSignal` on news/calendar fetches** —
      `NewsPage.tsx` (`fetchInitial`/`loadMore`, ~73/86-99),
      `NewsFeed.tsx` (`load()`, ~61), `EconomicCalendarPage.tsx` (`load()`,
      ~164). Same pattern each time: fast tab-switching or rapid clicking
      causes out-of-order responses to overwrite newer data. Add an
      `AbortController` per request, abort the previous one before starting a
      new one, ignore the response if the signal was already aborted.
- [ ] **`NewsPage.tsx` `loadMore` offset drift** (~86-99) — uses
      `items.length` as the pagination offset, but SSE prepends new items
      into the same `items` array concurrently, so the offset drifts from
      what the backend actually already returned → duplicate or missing
      pages. Track the offset as separate state incremented only by
      `loadMore` itself, independent of live-prepended SSE items.
- [ ] **`NewsPage.tsx` unbounded `wireItems` growth** (~148-152) — SSE
      prepends grow this array forever in a long session, unlike `NewsFeed`
      which caps at 50. Apply the same cap here.
- [ ] **Centralize `BACKEND_URL`** — currently duplicated in 8 files
      (`authClient`, `chatClient`, `newsClient`, `marketClient`,
      `usageClient`, `useTickerPrices`, `StatusBar`, `AuthContext`), all doing
      `import.meta.env.VITE_API_URL || "http://localhost:3000"` independently.
      Move to one `src/shared/lib/config.ts` (or similar) exporting
      `BACKEND_URL`, import it everywhere instead. While here: the
      `vite.config.ts` `/api` proxy is dead config since every client already
      uses an absolute URL + `/api/v1` — either actually route through the
      proxy (relative URLs) or delete the proxy block; don't leave dead config
      that implies a routing strategy nothing uses.
- [ ] **`authClient.ts:64`** — `body?.error` is cast straight to
      `AuthApiError.message` with no type check; if the backend ever returns a
      non-string `error` field, this becomes `setState(object)` somewhere
      downstream, which crashes React ("Objects are not valid as a React
      child"). Add a `typeof body?.error === "string"` guard with a fallback
      message.

**Verify:** `npx tsc --noEmit && npm run build` after each sub-item if working
incrementally; do a full click-through of chat, news, and calendar pages
checking the Network tab for cancelled (not completed) requests when
navigating away mid-load.

---

## Phase 6 — Accessibility pass

Batch these together — no interdependencies, no logic risk, straightforward.

- [ ] Error message blocks → add `role="alert"` (or `aria-live="polite"`):
      `LoginPage.tsx` (~162-167), `RegisterPage.tsx` (~208-213),
      `AuthCallbackPage.tsx` (~47-49).
- [ ] `SettingsPage.tsx` (~202-227, ~335-401) — associate every `<label>`
      with its input via `htmlFor`/`id`.
- [ ] `ChatCommandBox.tsx` (~211-222) — icon-only tier buttons (Leaf/Globe)
      need `aria-label`, not just `title`.
- [ ] `TopBar.tsx` (~87-93) — credits indicator: either make it a real
      `<button>` if it's meant to be interactive, or drop `cursor-pointer`
      and any implied interactivity if it's purely decorative.
- [ ] `LoginPage.tsx:118` / `RegisterPage.tsx:136` — inline Google SVG needs
      `aria-hidden="true"`.
- [ ] `index.html:2` — `<html lang="id">` but the UI mixes English strings
      throughout; decide the actual primary language and either translate
      consistently or fix the `lang` attribute to match reality.
- [ ] `ChatCommandBox.tsx:39` — replace native `alert()` for oversized-image
      errors with the same inline error pattern used elsewhere in the file.
- [ ] `TickerStrip` — mark the decorative marquee `aria-hidden="true"`.
- [ ] `ChatHistoryList.tsx:94` — session-load target is a `<span onClick>`;
      change to a `<button>` so it's keyboard/focus reachable.

**Verify:** run a quick pass with the browser's built-in accessibility
inspector (or axe DevTools if installed) on Login, Chat, and Settings pages —
confirm the specific issues above no longer flag.

---

## Phase 7 — Type safety cleanup

Lowest priority — do this last, or skip if time-constrained (nothing here is
a live bug, just weakened tooling).

- [ ] Remove `// @ts-nocheck` from `AuthLayout.tsx:1` and
      `TradingViewWidget.tsx:1`, fix whatever type errors surface. Do this
      file-by-file — expect `TradingViewWidget.tsx` to need real work since
      it's flagged as the most error-prone file in the report.
- [ ] `useChatStore.ts` — replace `messages: any[]` with a real message type.
- [ ] `analyzePageHelpers.tsx:6-19` — type `markdownComponents` render props
      as `Components` from `react-markdown` instead of `(props: any)`.
- [ ] `tradingViewSymbols.ts:29` — the unmapped-symbol fallback emits
      `OANDA:${mt5Symbol}` but the lookup is case-sensitive while input isn't
      guaranteed uppercase; normalize input to uppercase before the lookup.
- [ ] `queries.ts:10` — `Parameters<typeof login>[0] extends undefined ? any
      : any` always resolves to `any` regardless of the condition; fix the
      conditional type or remove it if it's not actually doing anything.

**Verify:** `npx tsc --noEmit` with zero `@ts-nocheck`/`@ts-ignore` remaining
in the two files above, 0 type errors overall.

---

## Explicitly out of scope for this plan (noted, not actioned)

- Duplicate calendar implementations (`EconomicCalendar.tsx` panel vs
  `EconomicCalendarPage.tsx` page) sharing `COUNTRY_NAMES`, `flagEmoji`, etc.
  — real duplication, but a bigger refactor (extract shared module) than a
  "bugfix"; revisit separately once Phases 0-6 are done.
- `stripHtml`/`formatRelativeTime` duplicated in `NewsFeed.tsx`/`NewsPage.tsx`
  — same reasoning, batch with the calendar dedup pass above.
- Various Low/cosmetic items from the original report not listed as explicit
  TODOs above (hardcoded dummy values in `StatusBar.tsx`, `z-5` typo, global
  CSS `!important` overrides, etc.) — low risk, low value, pick these up
  opportunistically if touching a nearby file for another reason, don't
  dedicate a phase to them.
