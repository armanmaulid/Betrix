# Context — Frontend (Vite) Bugfix Progress

Plan: `docs/frontend-bugfix-plan.md` (source of truth, 8 phases + out-of-scope list).
Rules: work top-to-bottom, one phase per commit, run `npx tsc --noEmit && npm run build` (0 errors) before checking each phase's box. Don't reinterpret fixes; ask first if a fix looks wrong (token storage + session shape affect backend contract).

## Status

| Phase | Title | Status |
| --- | --- | --- |
| 0 | Cheap wins, zero risk | ✅ DONE — 2026-08-16 |
| 1 | Correctness bugs | ✅ DONE — 2026-08-16 |
| 2 | Auth/session security | ✅ DONE — 2026-08-16 |
| 3 | AuthContext re-render loop + stale token | ✅ DONE — 2026-08-16 |
| 4 | TradingViewWidget | ✅ DONE — 2026-08-16 |
| 5 | Cancellation / leaks / duplication | ✅ DONE — 2026-08-16 |
| 6 | Accessibility pass | ✅ DONE — 2026-08-16 |
| 7 | Type safety cleanup | ✅ DONE — 2026-08-16 |

## Phase 0 — completed

Commit: `024e598`. Changes:
- Deleted `src/features/analysis/pages/refactor_analyze.py` (destructive stray script).
- Deleted `vite.config.js` + `vite.config.d.ts` (Vite resolved `.js` first, `.ts` was silently ignored). `vite.config.ts` is now the sole config.
- Deleted dead components: `StrategyPanel.tsx`, `SignalResultCard.tsx`, `LightweightChartWidget.tsx`.
- Deleted dead exports: `usageClient.getMessages`, `usageClient.sendMessage`, `Message`/`GetMessagesParams`/`SendMessageData` types, `useLogoutMutation` (in `queries.ts`).
- Deleted dead state: `webSearchEnabled` (+ setter) from `useChatStore.ts` and its `ChatCommandBox.tsx` usage (Globe button + `Globe` import).
- Deleted `VITE_ALPHA_VANTAGE_API_KEY`, `VITE_MT5_BRIDGE_URL` from `vite-env.d.ts`.
- Bonus (safe, same-file): fixed `queries.ts` `useLoginMutation` type from `Parameters<typeof login>[0] extends undefined ? any : any` → explicit `{ email: string; password: string }` (was an always-`any`; `login` import also dropped as now unused).

Gate: `npx tsc --noEmit` = 0 errors; `npm run build` = 0 errors (vite v5.4.21, 1763 modules).

## Phase 1 — completed

Commit: `60e1df2`. Changes:
- `src/features/chat/api/chatClient.ts` — SSE parser: `isDoneEvent`/`isErrorEvent` hoisted out of the `while` read loop (flag survives chunk boundaries); switched from `\n`-only line split to `\n\n` frame-boundary parsing per SSE spec with `\r\n` → `\n` normalization; `event: error` now actually triggers `onError` (was only a comment).
- `src/features/chat/hooks/useChatStream.ts` — session writer now emits canonical camelCase `{ sessionId, title, message, createdAt }` (was snake_case `{ session_id, created_at }`), matching `ChatHistoryList.tsx` reader — fixes `key={undefined}`, `timeAgo` → "NaNd ago", and `setCurrentSessionId(undefined)` on click. Grep for remaining `session_id`/`created_at` in `chat` feature: 0 matches.

Gate: `npx tsc --noEmit` = 0 errors; `npm run build` = 0 errors (vite v5.4.21, 1763 modules).

Pending: manual verify (new chat → message appears in recent-sessions with real relative time → click loads session) — needs backend + browser.

## Phase 3 — completed

Commit: `2fda8e6`. Changes:
- `src/features/auth/context/AuthContext.tsx` — `login`/`loginWithToken`/`logout` wrapped in `useCallback` (correct deps; `logout` keyed on `sessionToken`), context value object wrapped in `useMemo` keyed on its actual state + callbacks → `AuthCallbackPage` effect (`[token, loginWithToken, navigate]`) gets a stable `loginWithToken` and no longer re-fires on provider re-renders. Root-cause fix; `AuthCallbackPage.tsx` unchanged.
- Same file — `loginWithToken` now persists the token to localStorage + state only AFTER `authApi.fetchMe(token)` succeeds; on throw nothing is written, so no stale token survives (previously the invalid token stayed in localStorage + state and only self-healed on reload).

Gate: `npx tsc --noEmit` = 0 errors; `npm run build` = 0 errors (vite v5.4.21, 1763 modules).

Pending: manual verify (throttle "Slow 3G" → Google OAuth callback → `/api/v1/auth/me` fires exactly once; invalid `?token=` → error shown and `localStorage` ends up empty) — needs backend + browser.

## Phase 4 — completed

Commit: `a3af2a3`. Changes:
- `src/features/market/components/TradingViewWidget.tsx` — `tv.js` now loads at most ONCE per page load via a module-level `tradingViewScriptPromise` + `ensureTradingViewScript()` (resets to null on failure so the retry button can attempt a fresh load). Each mount re-runs `initWidget()` only; no more `<script>` leak per symbol switch. Added a `cancelled` flag so the async `.then`/`.catch` can't setState after unmount.
- Same file — `onError` stabilized via `onErrorRef` (separate effect with `[onError]` keeps the ref current; main effect calls `onErrorRef.current?.()`), and `onError` removed from the main effect's dep array — an inline `onError` arrow from a parent can no longer remount the widget every render.

Gate: `npx tsc --noEmit` = 0 errors; `npm run build` = 0 errors (vite v5.4.21, 1763 modules).

Pending: manual verify (open dashboard, switch the traded symbol several times, confirm via dev tools → Elements → `<head>` that only ONE `s3.tradingview.com/tv.js` tag exists) — needs browser.

## Phase 5 — completed

Commit: `b3ca8c8`. Changes:
- `src/shared/lib/config.ts` (new) — single `BACKEND_URL` source; removed the duplicate `import.meta.env.VITE_API_URL || "http://localhost:3000"` from 8 files (`authClient`, `chatClient`, `newsClient`, `marketClient`, `usageClient`, `useTickerPrices`, `StatusBar`, `AuthContext`). Deleted the dead `/api` proxy block from `vite.config.ts`.
- `useTickerPrices.ts` — shared SSE refcount now covers ALL consumers: added `baseConsumers` + `acquireSharedEventSource()`/`releaseSharedEventSource()` (increment on mount, decrement on unmount, close when total = 0); `getSharedEventSource` removed. `onopen`/`onerror` wired: connection health tracked + exposed via `useStreamConnection()`; on server-close (readyState CLOSED, e.g. 401) the stream is recreated once after 2s backoff while anyone still needs it and a token exists.
- `NewsFeed`, `NewsPage`, `EconomicCalendar`, `EconomicCalendarPage` — now use `acquireSharedEventSource()`/`releaseSharedEventSource()` (previously called `getSharedEventSource()` with no decrement → connection leaked forever).
- `chatClient.ts` — `streamChat` accepts an optional `AbortSignal`, wired into `fetch` + the reader loop (breaks on abort, skips `onError` for AbortError). `useChatStream` holds an `AbortController` and aborts the in-flight stream on unmount.
- `newsClient.getNews` + `marketClient.fetchEconomicCalendar` — accept `AbortSignal`; `NewsPage` (fetchInitial/loadMore), `NewsFeed` (load), `EconomicCalendarPage` (load) abort the previous request before starting a new one and ignore aborted responses (no setState after unmount/race).
- `NewsPage` — `loadMore` offset now tracked as separate `archiveOffset` state (was `items.length`, which SSE prepends drift); `wireItems` capped at 50 like `NewsFeed`.
- `authClient.ts` — `parseErrorAndThrow` guards `typeof body?.error === "string"` with a fallback message (non-string server error would otherwise crash React downstream).

Gate: `npx tsc --noEmit` = 0 errors; `npm run build` = 0 errors (vite v5.4.21, 1764 modules).

Pending: manual verify (click through chat, news, calendar pages checking the Network tab for cancelled — not completed — requests when navigating away mid-load).

## Phase 6 — completed

Commit: `2f79ce3`. Changes:
- `role="alert"` on error blocks: `LoginPage.tsx`, `RegisterPage.tsx`, `AuthCallbackPage.tsx`.
- Google SVG buttons: `aria-hidden="true"` on `LoginPage.tsx` + `RegisterPage.tsx`.
- `SettingsPage.tsx` — all 11 label/input pairs (FULL NAME, PHONE, BIRTHDATE, GENDER, ADDRESS, BIO, password/email panels) now associated via `htmlFor`/`id`.
- `ChatCommandBox.tsx` — Leaf tier button got `aria-label`; oversized-image error switched from native `alert()` to an inline `role="alert"` banner (state-driven).
- `TopBar.tsx` — credits indicator is decorative (no onClick): dropped `cursor-pointer` + `hover` + `transition-colors`.
- `index.html` — DECISION: primary UI language is Indonesian (auth pages, nav, settings), so `lang="id"` is kept as-is; no change (English strings are isolated labels).
- `TickerStrip.tsx` — the second marquee copy (rendered only for the seamless translateX loop) is `aria-hidden="true"` so prices aren't announced twice; the first copy stays readable.
- `ChatHistoryList.tsx` — session-load target changed from `<span onClick>` to a real `<button>` (keyboard/focus reachable).

Gate: `npx tsc --noEmit` = 0 errors; `npm run build` = 0 errors (vite v5.4.21, 1764 modules).

Pending: manual a11y pass (browser inspector / axe on Login, Chat, Settings) to confirm the flagged issues are gone.

## Phase 7 — completed

- `AuthLayout.tsx` — removed `// @ts-nocheck` and the `// @ts-ignore` on the `--drift` CSS custom prop. Dropped an unused `i` param in the `Array.from` callback; `--drift` typed via a narrow `as CSSProperties` cast (installed csstype has no `--*` index signature).
- `TradingViewWidget.tsx` — removed `// @ts-nocheck`. Added a minimal `declare global` typing for `window.TradingView` (only the `widget` ctor + the config fields actually used) and replaced `NodeJS.Timeout` (no `@types/node` installed) with `ReturnType<typeof setTimeout>`.
- `useChatStore.ts` — new exported `ChatMessage` type (`role: "user" | "agent" | "assistant"`, `content`, optional `image`/`isTyping`/`thinkingTime`/`tools`/`cost`/`isFinishedGlow`); `messages`/`setMessages` now `ChatMessage[]` instead of `any[]`.
- `useChatStream.ts` + `ChatMessageItem.tsx` — consume `ChatMessage`; removed the `as any` on the typing placeholder and the `(m: any)` casts.
- `analyzePageHelpers.tsx` — `markdownComponents` typed as `Components` from `react-markdown` (render props inferred, no more `(props: any)`).
- `tradingViewSymbols.ts` — `toTradingViewSymbol` normalizes input to uppercase before the case-sensitive lookup, so lowercase input (e.g. `"xauusd"`) maps correctly and the fallback emits `OANDA:XAUUSD` not `OANDA:xauusd`.
- `queries.ts` — no change needed; the always-`any` conditional type was already removed in Phase 0.

Gate: `npx tsc --noEmit` = 0 errors; `npm run build` = 0 errors (vite v5.4.21, 1764 modules). Zero `@ts-nocheck`/`@ts-ignore` directives remain in the two files.

## Phase 2 — completed

Commit: `1627907` (frontend execution; amend dari `eeb652e`). Changes:
- `src/features/auth/api/authClient.ts` — `getStreamTicket(sessionToken)` (POST `/api/v1/auth/stream-ticket`, Bearer → `{ ticket }`, lempar `AuthApiError` kalau 401) + `exchangeOAuthCode(code)` (POST `/api/v1/auth/oauth/exchange` → `{ sessionToken, user }` bertipe `LoginSuccess`).
- `src/features/auth/context/AuthContext.tsx` — SSE effect jadi `connect()` async: fetch ticket → `new EventSource(?ticket=)`; fetch ticket gagal (sesi mati) = stream tertutup + `isConnected=false`, TANPA fallback `?token=` dan tanpa retry loop; onerror readyState CLOSED (ticket terbakar, EventSource auto-reconnect tak bisa pakai ticket lama) → reconnect 2 dtk dengan ticket BARU; cleanup: `cancelled` flag + close stream + clear timer.
- `src/features/market/hooks/useTickerPrices.ts` — `updateGlobalStream` jadi async: fetch ticket sesaat sebelum EventSource dibuka, dedup via `connectPromise` (satu fetch ticket per connect, semua caller berbagi), re-check `stillNeeded` setelah await (bisa logout/konsumen hilang selama fetch); `acquireSharedEventSource()` jadi async (`Promise<EventSource | null>`).
- 4 konsumen (`NewsFeed`, `NewsPage`, `EconomicCalendar`, `EconomicCalendarPage`) — pola `.then` + `cancelled` flag; kalau resolve setelah unmount → `releaseSharedEventSource()` biar refcount seimbang.
- `src/features/auth/pages/AuthCallbackPage.tsx` — baca `?code=` (bukan `?token=`) → `exchangeOAuthCode(code)` → `loginWithToken(sessionToken)` → navigate `/`; path `?token=` dibuang.
- `vite.config.ts` — plugin `cspProdHardening()` (`transformIndexHtml`, `apply: "build"`): saat `vite build`, meta CSP di-rewrite — `script-src` jadi `'self' 'sha256-<hash>' https://*.tradingview.com https://*.tradingview-widget.com` (tanpa `'unsafe-inline'`), hash sha256 dihitung dinamis dari isi script inline anti-clickjacking via Web Crypto (`crypto.subtle`); `style-src 'unsafe-inline'` TIDAK disentuh; dev tidak disentuh (Fast Refresh butuh inline preamble). Verifikasi: hash di CSP === hash script inline di `dist/index.html` (cocok ✓).
- `tsconfig.node.json` — tambah `lib: ["ES2022", "DOM"]` (typing Web Crypto untuk `vite.config.ts`), plus `outDir` + `tsBuildInfoFile` → `node_modules/.tmp/` — **root cause** misteri `vite.config.js` muncul-muncul: `tsc -b` (composite tanpa noEmit, TS6310 menolak noEmit di proyek yang di-reference) meng-emit `vite.config.js`/`.d.ts` ke root, dan Vite resolve `.js` duluan sehingga file emit diam-diam menimpa `vite.config.ts` (plugin CSP tidak pernah terpakai sampai ini dibereskan).

Gate: `npx tsc --noEmit` = 0 errors; `npm run build` = 0 errors (vite v5.4.21, 1764 modules). CSP di `dist/index.html` ter-rewrite (tanpa `'unsafe-inline'` di `script-src`).

Verifikasi live (log backend 2026-08-16): login Google → `exchange` 200 (sebelum fix backend: 400) → `me` 304 → `stream-ticket` 200 → `news/stream?ticket=` terbuka (bukan `?token=`). Manual verify tersisa (needs browser): reconnect pakai ticket baru saat onerror, invalid code → localStorage kosong, logout → localStorage bersih, CSP prod tidak memblokir TradingView / anti-clickjacking tetap jalan.

### Keputusan
Option B (stream ticket) + CSP hardening (prod-only) + OAuth one-time code. Option A (httpOnly cookie) NOT chosen — backend overhaul too big for this phase.

> ✅ Semua bagian di bawah (kontrak, frontend work, CSP, sequencing) sudah DIEKSEKUSI — backend live + frontend Phase 2 committed (`1627907`). Dipertahankan sebagai riwayat keputusan/kontrak.

### Kontrak backend (serahkan ke backend; eksekusi menunggu konfirmasi + deploy)
1. **`POST /api/v1/auth/stream-ticket`** — request `Authorization: Bearer <token>` → 200 `{ ticket }`. Ticket: opaque, single-use (burn after 1 use), TTL 30–60 dtk. 401 kalau token invalid. Logout sesi → hapus ticket sesi. Route `news/stream` terima `?ticket=` GANTI `?token=`; kalau keduanya ada → tolak, jangan fallback ke token.
2. **`POST /api/v1/auth/oauth/exchange`** — request `{ code }` → 200 `{ sessionToken, user }` (shape = `LoginSuccess` di `authClient.ts`). 400 kalau code invalid/expired/dipakai.
3. **Redirect Google OAuth** — `?token=<sessionToken>` → `?code=<one-time-code>` (single-use, TTL ~5 mnt).

### Frontend work pending (file + aksi) — WAIT for backend endpoints, then:
1. `src/features/auth/api/authClient.ts` — tambah `getStreamTicket()` (bearer → `{ ticket }`) dan `exchangeOAuthCode(code)`.
2. `src/features/auth/context/AuthContext.tsx:69` — `new EventSource(...news/stream?token=...)` → fetch ticket dulu → `?ticket=`; kalau gagal: tutup stream + `isConnected=false`, TIDAK fallback ke `?token=`.
3. `src/features/market/hooks/useTickerPrices.ts:71` — sama (ticker/calendar stream).
4. `src/features/auth/pages/AuthCallbackPage.tsx:12` — baca `?code=` (bukan `?token=`) → `exchangeOAuthCode` → `loginWithToken(sessionToken)`.

### CSP hardening (pure frontend, SAFE TO DO ANYTIME — belum dikerjakan)
> ✅ SUDAH DIKERJAKAN di Phase 2 (`1627907`) — lihat deskripsi Phase 2 di atas.
- **JANGAN** edit meta CSP di `index.html` apa adanya → `@vitejs/plugin-react` v4 inject inline preamble (`injectIntoGlobalHook`) saat dev; hapus `'unsafe-inline'` = React Fast Refresh mati di dev.
- `vite.config.ts`: plugin `transformIndexHtml` yang menulis ulang meta CSP **hanya saat `vite build`** → `script-src 'self' 'sha256-<hash anti-clickjack>' https://*.tradingview.com https://*.tradingview-widget.com` (tanpa `'unsafe-inline'`). Script anti-clickjacking TETAP inline di `index.html`, diizinkan via hash (jangan dipindah ke file eksternal — risiko blank page kalau fetch gagal). `style-src 'unsafe-inline'` tidak disentuh.

### Sequencing & verify
- Kalau frontend dieksekusi sebelum backend deploy: SSE berhenti (ticket 404) + login Google rusak (callback `?code=` tak bisa diproses). Urutan aman: backend deploy → frontend §di atas → gate `npx tsc --noEmit && npm run build` 0 error → manual verify (chat + ticker streaming; Network tab: URL SSE `?ticket=` bukan `?token=`; logout → localStorage bersih).

## Notes / next steps

All 8 phases are done (0, 1, 2, 3, 4, 5, 6, 7) — Phase 2 dieksekusi setelah backend contract live (lihat `docs/phase2-backend-response.md`). Branch `fix/frontend-bugfix-plan` sudah di-push ke `origin` (commit `60e1df2`..`0e5d921`, termasuk Phase 0 `024e598` + Phase 2 contract `8d0f2c3` dari riwayat lama).

### Backend fix di luar scope FE (ditemukan saat verifikasi Phase 2)

Commit `0e5d921` (di branch yang sama, file `Backend/src/data/repositories/RedisOAuthCodeStore.ts` + test): Upstash REST client auto-parses JSON on read (`automaticDeserialization` default true), jadi `getAndDelete` menerima **object** bukan string — `JSON.parse(object)` throw → catch → null → 400 "Invalid or expired OAuth code" SELALU, walau code valid. Fix: parse hanya kalau nilai masih string, object dipakai langsung (pola sama dengan `RedisSessionRepository`/`RedisMarketDataRepository`). +5 test regresi. Verifikasi live: exchange 200 setelah fix.

Catatan kecil (tidak difix, bukan bug): kedua POST `exchange` (StrictMode dev double-effect) sama-sama 200 karena `getAndDelete` non-atomik (`get` lalu `del`) — keduanya sempat baca code sebelum dihapus. Tidak berbahaya (sessionToken sama untuk user sama). Kalau kontrak "single-use" mau ditegakkan ketat, ganti ke `redisClient.getdel()` atomik (tersedia di `@upstash/redis` 1.38).

Remaining:

- Manual verification pending (needs browser): chat session history (Phase 1), OAuth callback re-fire (Phase 3), single `tv.js` tag (Phase 4), a11y pass (Phase 6), dan sisa Phase 2 (reconnect ticket baru saat onerror; invalid code → localStorage kosong; logout → localStorage bersih; CSP prod tidak memblokir TradingView).
- PR ke `main` belum dibuat — branch `fix/frontend-bugfix-plan` siap: https://github.com/armanmaulid/Betrix/pull/new/fix/frontend-bugfix-plan
- Commit discipline: one phase = one commit on a branch off `main`.

## Commit discipline

One phase = one commit on a branch off `main` (repo default branch is `main`).
