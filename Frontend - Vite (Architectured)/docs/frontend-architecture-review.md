# Betrix Frontend Code Review Report

**Date:** 2026-08-17
**Scope:** Deep-dive architectural and feature review of the Vite + React (TypeScript) frontend.

## 🌟 Overall Architecture Assessment

The Betrix Frontend demonstrates a highly sophisticated architecture suited for high-performance financial data applications. The separation of concerns between layout shells, feature pages, and shared utilities is well-executed, leading to a predictable codebase. The "Bloomberg Terminal" aesthetic is effectively achieved through meticulous CSS variables and animation implementations, while maintaining a clear and standard React mental model.

### Key Strengths
*   **Real-time Infrastructure:** The shared EventSource implementation is brilliant for avoiding connection limits.
*   **Security & Optimizations:** Strong security-conscious setups (CSP hardening, frame-busting) and solid performance optimizations (memoization, visibility-aware network polling, and Suspense-based code splitting).
*   **State Management:** The mix of Zustand for global UI/Chat state and React Query for server cache is excellent and follows industry best practices.

---

## 🏗️ 1. Core Architecture & Layouts

*   **`src/app/main.tsx` & `App.tsx`**
    *   🟢 **Good Practice:** Proper use of `lazy` and `Suspense` for code-splitting routes, reducing initial bundle size. Solid `ProtectedRoute` wrapper.
    *   💡 **Suggestion:** Import statements in `App.tsx` are mixed up. Sort and group imports for better maintainability. Extract `RouteFallback` to a separate file to keep the routing layer clean.

*   **`src/app/layout/SideNavRail.tsx`**
    *   🟢 **Good Practice:** Usage of `React.memo` to prevent unnecessary re-renders of the static navigation rail.
    *   💡 **Suggestion (Accessibility):** Add `aria-current="page"` to the active navigation button for better screen reader and semantic HTML support.
    *   🟡 **Warning:** Active route matching logic (`location.pathname === path`) is rigid and doesn't account for nested routes. Consider React Router's `matchPath`.

*   **`src/app/layout/TopBar.tsx`**
    *   💡 **Suggestion (Performance):** The real-time clock triggers a state update every second `setInterval(() => setNow(new Date()), 1000)`. Extract this fast-updating state into its own small `<Clock />` leaf component so it doesn't cause the entire `TopBar` to re-render every second.

*   **`src/shared/lib/analyzePageHelpers.tsx`**
    *   🔴 **Critical (Security/Design):** `buildTradeAnalysisPrompt` constructs the LLM prompt on the client side. This exposes system instructions to the client and is vulnerable to manipulation. **Move LLM prompt generation to the backend.**

---

## 🚀 2. Feature Modules

### Feature: Analysis (`src/features/analysis`)
*   **`AnalyzePage.tsx`**
    *   🟢 **Good Practice:** Excellent usage of the `useShellContext` to dynamically inject right-panel components (`NewsFeed`, `EconomicCalendar`) when the page mounts, keeping the layout decoupled.
    *   🟡 **Warning:** Iterating over `messages.map((msg: any, ...)` instead of properly typing `msg` as `ChatMessage`.


### Feature: Auth (`src/features/auth`)
*   **`api/authClient.ts`**
    *   🟢 **Good Practice:** Strong custom error handling with `AuthApiError` mapping specific backend states (`needsVerification`, `hasActiveSession`) into actionable UI flags.
    *   💡 **Suggestion:** Avoid relying on generic `catch(() => null)` when parsing JSON responses; it can mask structural changes in the backend payload.
*   **`context/AuthContext.tsx`**
    *   🟡 **Warning:** The `EventSource` `onerror` handler blindly retries `connect()` after 2 seconds on close. If the backend is permanently down or the network drops, this creates an infinite retry loop without exponential backoff.

### Feature: Chat (`src/features/chat`)
*   **`api/chatClient.ts`**
    *   🟡 **Warning:** A manual `Map` cache is used for `getChatHistory` with a hardcoded 15-second TTL. You should migrate this to React Query, standardizing with the pattern in `market/api/queries.ts`.
    *   🟡 **Warning:** Manual parsing of the SSE chunked stream (`buffer.split("\n\n")`). Edge cases around chunk boundaries splitting in the middle of a Unicode character could break `TextDecoder`.
*   **`hooks/useChatStream.ts`**
    *   🔴 **Critical:** The `handleSubmit` function is a "God Hook" (~200 lines) violating the single-responsibility principle. It handles UI state, parsing commands, fetching market data, fetching news, prompt construction, and SSE token flushing. Abstract this into a dedicated service layer (e.g., `ChatOrchestrator`).
    *   💡 **Suggestion:** The 40ms token flusher using `setTimeout` is a clever throttling mechanism. Consider wrapping the state update in `React.startTransition` for even smoother concurrent rendering.

### Feature: Market (`src/features/market`)
*   **`api/marketClient.ts`**
    *   🔴 **Critical:** Using `window.location.href = "/login"` inside the API client on `401` errors forces a full browser reload, breaking SPA routing. Throw a specific Auth error and handle the redirect at the interceptor/context level.
*   **`components/EconomicCalendar.tsx`**
    *   🟡 **Warning:** The `flagEmoji` function uses Unicode regional indicators. **Windows does not natively support emoji flags** (they render as 2-letter codes like "US"). Use an icon library (e.g., `flag-icons`) if visual parity on Windows is strictly required.

### Feature: News (`src/features/news`)
*   **`components/NewsFeed.tsx`**
    *   🟡 **Warning:** Uses a `Map` deduplication technique for incoming articles. Arrays are constantly spread `[...newArticles, ...prev]`. While capped at 50, memory churn is slightly high during active streams.

### Feature: User (`src/features/user`)
*   **`pages/SettingsPage.tsx`**
    *   🟡 **Warning:** This file is excessively large (687 lines) and handles rendering/logic for Profile, Passwords, Emails, Active Sessions, and API Usage metrics. It desperately needs to be split into sub-components (e.g., `<ProfileSettingsTab />`, `<UsageSettingsTab />`).
    *   🟢 **Good Practice:** Great use of inline data visualization (CSS-based horizontal bar charts for API token usage) avoiding heavy chart library dependencies.

---

## 🎯 Action Plan / Next Steps

1.  **Refactor Critical Anti-Patterns:**
    *   Remove `window.location.href` from `marketClient.ts`.
    *   Move prompt generation out of the client (`analyzePageHelpers.tsx`).
    *   Break down the `useChatStream` "God Hook".
2.  **Optimize Rendering:**
    *   Extract the `TopBar` clock to a leaf component.
    *   Migrate legacy `Map` caches (chat, news) to React Query.
3.  **Clean up Tech Debt:**
    *   Split `SettingsPage.tsx` into smaller components.
    *   Implement exponential backoff in `AuthContext` SSE reconnects.
