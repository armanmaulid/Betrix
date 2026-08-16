# Proposal Phase 2 — Token Storage & Session Security

Status: **DECIDED — 2026-08-16** — Option B (stream ticket) + CSP hardening + OAuth one-time code. Kontrak backend final di §7.1; eksekusi frontend menunggu konfirmasi backend (lihat §7.3).
Tanggal: 2026-08-16
Ruang lingkup: frontend Vite (`betrix-client`) + endpoint backend terkait auth/SSE.

---

## 1. Masalah yang mau dibereskan

### 1.1 Token sesi bocor lewat URL SSE (high)
`EventSource` tidak bisa set header, jadi token sesi ditaruh di query string:

- `src/features/auth/context/AuthContext.tsx:69` → `GET /api/v1/news/stream?token=<sessionToken>`
- `src/features/market/hooks/useTickerPrices.ts:71` → `GET .../news/stream?token=<sessionToken>` (ticker + calendar)

Akibat: token masuk **server/proxy access log**, **browser history**, dan header **Referer** request berikutnya. Token di URL = token permanen yang bocor ke tempat yang tidak terkontrol.

### 1.2 Token sesi di `localStorage` + CSP lemah (medium)
- Token disimpan di `localStorage` (`key: "eaconsole.sessionToken"`) — bisa diexfiltrate oleh XSS.
- `index.html` CSP mengizinkan `script-src 'unsafe-inline'` → perisai XSS sudah longgar sejak awal.
- **Verdict yang sudah diverifikasi:** TIDAK ada `dangerouslySetInnerHTML` di seluruh `src/` (sudah dicek repo-wide di awal Phase 2) → risiko exfiltrasi lebih rendah daripada rata-rata SPA, tapi bukan nol. Ini item yang bisa ditunda, bukan darurat.

### 1.3 Temuan tambahan: token OAuth di URL callback (high, di luar 2 item plan)
`AuthCallbackPage.tsx:12` membaca `?token=` dari query string — backend Google-OAuth redirect membawa **session token langsung di URL**. Ini vektor kebocoran yang sama dengan 1.1 (access log + history + Referer), dan terjadi SETIAP login via Google. Tidak tercantum di plan asli, tapi kalau Phase 2 menyentuh model token, ini kesempatan yang tepat untuk dibereskan sekalian (lihat §5.4).

---

## 2. Inventarisasi pemakaian token hari ini (untuk mengukur dampak)

Model saat ini: **bearer token** — login mengembalikan `{ sessionToken, user }` (lihat `authClient.ts` `LoginSuccess`), frontend menyimpannya di localStorage dan mengirimnya sebagai header `Authorization: Bearer <token>` di hampir semua request.

**Call site frontend yang menyentuh token:**

| Area | File | Cara pakai |
| --- | --- | --- |
| Auth | `auth/context/AuthContext.tsx` | set/get/remove localStorage + SSE `news/stream?token=` |
| Auth | `auth/api/authClient.ts` | `login`, `logout`, `fetchMe`, `updateProfile`, `changePassword`, `changeEmail`, `getSessions`, `revokeSession` — semua bearer |
| Chat | `chat/api/chatClient.ts` | 3× bearer (`streamChat`, `fetchSessions`, `fetchMessages`) |
| Chat | `chat/hooks/useChatStream.ts:78` | baca localStorage utk news context |
| Market | `market/api/marketClient.ts` | 3× bearer + handler 401 |
| Market | `market/hooks/useTickerPrices.ts` | SSE `?token=` + 1× bearer fetch |
| News | `news/api/newsClient.ts` | bearer |
| News | `news/components/NewsFeed.tsx:68`, `news/pages/NewsPage.tsx:75,129,181` | baca localStorage |
| User | `user/api/usageClient.ts` | bearer |
| User | `user/pages/SettingsPage.tsx:22` | baca localStorage |
| Layout | `app/layout/StatusBar.tsx:22` | baca localStorage |

**Backend endpoints yang saat ini membaca `Authorization: Bearer`:** login, logout, me, profile update, change password/email, sessions + revoke, news, market candles/calendar/symbols, chat stream/sessions/messages, usage.

---

## 3. Opsi A — httpOnly cookie (perubahan besar)

Token sesi dipindah ke **httpOnly cookie** yang di-set backend saat login; semua request browser memakai cookie otomatis, header `Authorization: Bearer` dihapus untuk request browser.

### Perubahan frontend
- Semua api client (~10 file): hapus header `Authorization`, tambah `credentials: "include"` pada fetch.
- `AuthContext`: hapus logika localStorage; `restoreSession` cukup panggil `/me` (cookie ikut otomatis).
- SSE: `EventSource` same-origin mengirim cookie otomatis → **query string bersih total**, dua call site di atas jadi `?token=` dihapus.
- `AuthCallbackPage`: OAuth callback tidak lagi terima token di URL — backend set cookie, frontend tinggal `/me`.
- Login: response tidak lagi membawa token di body.

### Perubahan backend (yang harus disetujui backend)
- Semua route ganti sumber token: header → cookie (parser cookie + validasi).
- **CORS**: izinkan `Access-Control-Allow-Credentials: true` + origin eksplisit (bukan `*`).
- **Cookie config**: `HttpOnly`, `Secure`, `SameSite=Lax` (atau Strict) + `Path`.
- **CSRF protection** baru untuk semua mutasi (cookie same-site tidak otomatis aman dari CSRF; perlu token anti-CSRF atau double-submit).
- Logout: hapus cookie via `Set-Cookie` expired.
- OAuth callback: set cookie alih-alih redirect dengan token di URL.

### Biaya & risiko
- **Frontend:** luas tapi mekanis (~15 file, tidak ada logika baru yang rumit).
- **Backend:** besar — CORS, cookie, CSRF, refactor semua route. Risiko regresi auth tertinggi dari semua opsi.
- **Bonus:** menyelesaikan 1.1 + 1.2 + 1.3 sekaligus.

---

## 4. Opsi B — stream ticket (perubahan kecil, rekomendasi)

Bearer token **tetap dipakai** untuk API normal. Backend menambah **satu endpoint** yang menukar session token → **ticket sekali pakai berumur pendek** (mis. TTL 30–60 detik), khusus dipakai di URL SSE. Setelah dipakai (atau kedaluwarsa), ticket tidak bisa dipakai lagi.

### Perubahan frontend (kecil)
- `authClient.ts`: tambah `getStreamTicket()` → `POST /api/v1/auth/stream-ticket` dengan bearer → balikan `{ ticket }`.
- `AuthContext.tsx:69` + `useTickerPrices.ts:71`: sebelum `new EventSource`, fetch ticket dulu, lalu `new EventSource(".../news/stream?ticket=" + ticket)`. (Kedua call site sudah punya konteks async untuk ini.)
- Tidak ada file lain yang berubah.

### Perubahan backend (terisolasi, addition-only)
- 1 endpoint baru: `POST /api/v1/auth/stream-ticket` (auth bearer → `{ ticket }`).
- Store ticket: in-memory/TTL cache (Redis/DB optional), single-use, expire 30–60 dtk.
- `news/stream` (dan ticker/calendar stream kalau satu route): terima `ticket` ATAU bearer. Ticket divalidasi sekali lalu di-burn.
- Revoke saat logout: hapus semua ticket milik sesi (best-effort; TTL pendek sudah membatasi).

### Biaya & risiko
- **Frontend:** 2–3 file.
- **Backend:** 1 endpoint + validasi ticket di route stream. Tidak menyentuh model auth, CORS, atau CSRF.
- **Yang TIDAK diselesaikan:** 1.2 (localStorage + CSP) — perlu keputusan terpisah (§5.3), dan 1.3 (OAuth token di URL) — lihat §5.4.

---

## 5. Keputusan yang dibutuhkan dari backend

### 5.1 Opsi mana? (blokir utama Phase 2)
- **A — httpOnly cookie:** sekali beres 1.1 + 1.2 + 1.3, tapi backend overhaul (CORS + CSRF + semua route).
- **B — stream ticket:** perubahan backend terisolasi, hanya menutup 1.1; 1.2 ditangani terpisah.

### 5.2 Kalau B: harden CSP sekarang atau tidak? — DECIDED: lakukan (prod-only)
CSP saat ini: `script-src 'self' 'unsafe-inline' https://*.tradingview.com https://*.tradingview-widget.com`.

**Constraint penting (sudah diverifikasi):** `@vitejs/plugin-react` v4 menyuntikkan **inline preamble** (`injectIntoGlobalHook`) ke `index.html` saat dev mode. Kalau `'unsafe-inline'` dihapus dari meta CSP statis, **React Fast Refresh di `npm run dev` ikut mati**. Maka:

- **Jangan** edit meta CSP di `index.html` apa adanya → merusak dev HMR.
- **Pendekatan yang dipilih:** plugin Vite kecil (`transformIndexHtml`) yang menulis ulang meta CSP **hanya saat `vite build` (production)** → dev tetap seperti sekarang, prod dapat versi keras.
- **Script anti-clickjacking TETAP inline**, diizinkan lewat hash `'sha256-...'` di `script-src` (dihitung dari teks script yang statis). Tidak dipindah ke file eksternal — kalau fetch file gagal, `body{display:none}` tidak pernah dicabut = blank page (risiko lebih besar daripada benefit-nya).
- `style-src 'unsafe-inline'` TIDAK disentuh (dibutuhkan React inline style attributes; normal dan tidak mengekspos token).

Hasil: 1.2 turun medium → low. Biaya frontend: 1 file (`vite.config.ts`) + hash statis.

### 5.3 Kalau A: siap untuk CSRF + CORS credentials?
Backend harus menyetujui menambah anti-CSRF (token/double-submit) dan mengubah config CORS. Tanpa ini, Option A tidak aman untuk diimplementasikan.

### 5.4 OAuth callback pakai one-time code? — DECIDED: lakukan
Ganti redirect `?token=<sessionToken>` → `?code=<one-time-code>` (frontend tukar code → token via `POST /api/v1/auth/oauth/exchange`, response di body, bukan di URL). Ini menutup 1.3 (session token tidak pernah lagi muncul di URL).

---

## 6. Perbandingan singkat

| | A — httpOnly cookie | B — stream ticket |
| --- | --- | --- |
| Menutup SSE URL leak (1.1) | ✅ | ✅ |
| Menutup localStorage/XSS (1.2) | ✅ otomatis | ❌ (perlu harden CSP terpisah) |
| Menutup OAuth URL leak (1.3) | ✅ otomatis | ❌ (perlu one-time code terpisah) |
| Effort frontend | ~15 file, mekanis | 2–3 file |
| Effort backend | Besar (CORS, CSRF, semua route) | Kecil (1 endpoint + validasi ticket) |
| Risiko regresi | Tertinggi | Rendah |

**Rekomendasi (SUDAH DIPUTUSKAN):** **Option B** (stream ticket) + **harden CSP prod-only** + **one-time code OAuth**. Option A (httpOnly cookie) tidak dipilih — backend overhaul (CORS credentials + CSRF + semua route) terlalu besar untuk bugfix Phase 2.

---

## 7. Kontrak & scope eksekusi (paket yang diputuskan)

### 7.1 Kontrak backend (2 endpoint baru — perlu konfirmasi sebelum eksekusi)

**Endpoint 1 — stream ticket:**
- `POST /api/v1/auth/stream-ticket`
- Request: `Authorization: Bearer <sessionToken>`
- Response 200: `{ "ticket": "<opaque>" }`
- Ticket: **single-use** (di-burn setelah satu kali dipakai), **TTL 30–60 detik**, tidak mengandung info sesi yang bisa di-decode (opaque).
- 401 kalau token invalid/expired.
- Logout sesi → hapus semua ticket milik sesi (best-effort; TTL pendek sudah membatasi).
- Route `news/stream` (dan stream lain yang memakai query string) menerima `?ticket=` sebagai pengganti `?token=`; kalau keduanya ada, tolak (jangan fallback ke token).

**Endpoint 2 — OAuth one-time code:**
- Redirect Google OAuth: `?code=<one-time-code>` (bukan `?token=<sessionToken>`). Code: single-use, TTL pendek (mis. 5 menit).
- `POST /api/v1/auth/oauth/exchange` — Request `{ "code": "..." }` → Response 200 `{ "sessionToken": "...", "user": {...} }` (sama dengan shape `LoginSuccess` saat ini).
- 400 kalau code invalid/expired/sudah dipakai.

### 7.2 Scope frontend (setelah endpoint backend tersedia)

**Stream ticket (#1):**
1. `authClient.ts` — tambah `getStreamTicket()` (bearer → `{ ticket }`).
2. `AuthContext.tsx:69` — fetch ticket dulu → `new EventSource(".../news/stream?ticket=" + ticket)`; kalau ticket gagal: tutup stream, `isConnected=false` (TIDAK fallback ke `?token=`).
3. `useTickerPrices.ts:71` — sama.

**CSP hardening (#2, prod-only):**
4. `vite.config.ts` — plugin `transformIndexHtml` yang menulis ulang meta CSP saat build: `script-src 'self' 'sha256-<hash-anti-clickjack>' https://*.tradingview.com https://*.tradingview-widget.com` (tanpa `'unsafe-inline'`). Dev tidak tersentuh.

**OAuth one-time code (#3):**
5. `AuthCallbackPage.tsx` — baca `?code=` → `POST /oauth/exchange` → `loginWithToken(sessionToken)`.
6. `authClient.ts` — tambah `exchangeOAuthCode(code)`.

**Semua:** gate `npx tsc --noEmit && npm run build` → 0 error; update docs.

### 7.3 Sequencing — PENTING

Item 1–3 dan 5–6 **bergantung pada endpoint backend** (`/auth/stream-ticket`, `/auth/oauth/exchange`, dan perubahan redirect OAuth). Kalau frontend diimplementasikan sebelum endpoint deploy:
- SSE ticker/news-stream berhenti bekerja (request ticket 404).
- Login Google berhenti bekerja (callback terima `?code=` yang tidak bisa diproses).

Jadi urutan yang aman: **(a)** backend deploy 2 endpoint + ubah redirect OAuth → **(b)** frontend eksekusi §7.2 → **(c)** verifikasi manual. Alternatif kalau backend belum bisa: kerjakan **item 4 (CSP hardening) sekarang** — murni frontend, tidak ada dependensi, aman langsung dieksekusi.

**Verify (manual, butuh backend + browser):** login → chat + ticker tetap streaming; Network tab → tidak ada `?token=` di URL SSE (yang ada `?ticket=`); DevTools → `document.querySelectorAll('script[src*="anti-clickjack"]')` tidak ada / CSP prod tidak memblokir; logout → tidak ada kredensial tersisa di localStorage.
