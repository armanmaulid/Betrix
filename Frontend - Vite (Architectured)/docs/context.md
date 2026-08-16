# Context — Frontend (Vite) Bugfix Progress

Plan: `docs/frontend-bugfix-plan.md` (source of truth, 8 phases + out-of-scope list).
Rules: work top-to-bottom, one phase per commit, run `npx tsc --noEmit && npm run build` (0 errors) before checking each phase's box. Don't reinterpret fixes; ask first if a fix looks wrong (token storage + session shape affect backend contract).

## Status

| Phase | Title | Status |
| --- | --- | --- |
| 0 | Cheap wins, zero risk | ✅ DONE — 2026-08-16 |
| 1 | Correctness bugs | ⏳ next |
| 2 | Auth/session security | ⛔ BLOCKED — needs backend decision (token storage Option A/B) before start |
| 3 | AuthContext re-render loop + stale token | pending |
| 4 | TradingViewWidget | pending |
| 5 | Cancellation / leaks / duplication | pending |
| 6 | Accessibility pass | pending |
| 7 | Type safety cleanup | pending |

## Phase 0 — completed

Commit: (pending commit on main). Changes:
- Deleted `src/features/analysis/pages/refactor_analyze.py` (destructive stray script).
- Deleted `vite.config.js` + `vite.config.d.ts` (Vite resolved `.js` first, `.ts` was silently ignored). `vite.config.ts` is now the sole config.
- Deleted dead components: `StrategyPanel.tsx`, `SignalResultCard.tsx`, `LightweightChartWidget.tsx`.
- Deleted dead exports: `usageClient.getMessages`, `usageClient.sendMessage`, `Message`/`GetMessagesParams`/`SendMessageData` types, `useLogoutMutation` (in `queries.ts`).
- Deleted dead state: `webSearchEnabled` (+ setter) from `useChatStore.ts` and its `ChatCommandBox.tsx` usage (Globe button + `Globe` import).
- Deleted `VITE_ALPHA_VANTAGE_API_KEY`, `VITE_MT5_BRIDGE_URL` from `vite-env.d.ts`.
- Bonus (safe, same-file): fixed `queries.ts` `useLoginMutation` type from `Parameters<typeof login>[0] extends undefined ? any : any` → explicit `{ email: string; password: string }` (was an always-`any`; `login` import also dropped as now unused).

Gate: `npx tsc --noEmit` = 0 errors; `npm run build` = 0 errors (vite v5.4.21, 1763 modules).

## Notes for next phase (Phase 1)

- `chatClient.ts:46-73` — SSE parser: hoist `isDoneEvent` outside `while` loop; switch `\n`-only split to `\n\n` frame parsing; handle `\r\n`.
- Session shape: `useChatStream.ts:140-151` writes `{session_id, title, message, created_at}` (snake_case); `ChatHistoryList.tsx` reads `sessionId/createdAt/turns` (camelCase). Fix = one canonical camelCase shape, change writer (not reader). Grep whole `chat` feature for other `session_id`/`created_at` readers before done.
- Phase 1 verify: manual new-chat → message → appears in recent-sessions with real relative time → click loads session. Then build gate.

## Commit discipline

One phase = one commit on a branch off `main` (repo default branch is `main`).
