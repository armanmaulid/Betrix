# Proposal Balasan — Phase 2 (Backend → Frontend)

Status: **✅ KONTRAK BACKEND SELESAI & TERVERIFIKASI LIVE — FE BISA LANGSUNG EKSEKUSI §2**
Tanggal: 2026-08-16
Asal: Backend Betrix (balasan untuk `docs/phase2-token-storage-proposal.md` §7.1)
Tujuan: memberi Tim Frontend **kontrak final + instruksi implementasi** agar Phase 2 bisa dieksekusi sekarang.

> ⚠️ **BUG NYATA, PRIORITAS CRITICAL:** token sesi bocor lewat URL (SSE + callback OAuth). Kedua vektor sudah **ditutup di sisi backend** — tersisa kerja FE di §2. Jangan tunda; rilis backend+FE bersamaan (lihat §5).

---

## 1. Yang SUDAH dikerjakan backend (bukti: §6)

| Item proposal | Status |
|---|---|
| `POST /api/v1/auth/stream-ticket` (Bearer → `{ ticket }`) | ✅ DONE |
| `news/stream` terima `?ticket=` GANTI `?token=`; keduanya → tolak | ✅ DONE |
| `POST /api/v1/auth/oauth/exchange` (`{ code }` → `{ sessionToken, user }`) | ✅ DONE |
| Redirect Google OAuth `?token=` → `?code=` | ✅ DONE |
| Token di URL ditolak di SEMUA route (fallback `req.query.token` dihapus) | ✅ DONE (defense-in-depth) |

**Verifikasi backend:** tsc 0 · lint 0/0 · boundary 0 · test **12 files / 74 tests / 0 failed**.
**E2E live** (DB/Redis/MT5 ON): ticket → SSE `connected` + `price_update` BTCUSD mengalir ✅ · `?token=` → **400** ✅ · ticket dipakai ulang → **401** ✅ · exchange code sampah → **400** ✅ · `?ticket=abc&token=…` → **400** ✅ · **logout → ticket 401** ✅.

---

## 2. Kontrak final — spesifikasi persis untuk FE

### 2.1 `POST /api/v1/auth/stream-ticket`
- Request: `Authorization: Bearer <sessionToken>` — **tanpa body**.
- `200` → `{ "ticket": "<64 hex>" }` — opaque, **single-use**, **TTL 60 detik**.
- `401` → `{ "error": "Session not found or expired", "code": "UNAUTHENTICATED" }` (token invalid/expired).
- `401` (tanpa Bearer) → `{ "error": "Session token required", "code": "UNAUTHENTICATED" }`.

### 2.2 `GET /api/v1/news/stream` — aturan auth (streamAuthMiddleware)
| Skenario | Hasil |
|---|---|
| `?ticket=<t>` (valid) | `200` SSE — ticket **di-burn saat connect** (sekali pakai), lalu **session divalidasi ulang** |
| `?ticket=<t>` (invalid/terpakai/expired) | `401` `{ error: "Invalid or expired stream ticket", code: "UNAUTHENTICATED" }` |
| `?ticket=<t>` (session sudah logout) | `401` `{ error: "Session not found or expired", code: "UNAUTHENTICATED" }` |
| `?token=<t>` (URL) | **`400`** `{ error: "Session token in URL is not supported; request a stream ticket instead", code: "TOKEN_IN_URL_REJECTED" }` |
| `?ticket=<t>&token=<t>` (keduanya) | **`400`** `{ error: "Provide either a stream ticket or a session token, not both", code: "AMBIGUOUS_AUTH" }` |
| `Authorization: Bearer` | `200` (tetap jalan untuk klien non-EventSource) |
| tanpa auth | `401` `{ error: "Session token required", code: "UNAUTHENTICATED" }` |

Event SSE **tidak berubah**: `connected`, `price_update`, `ohlc_update`, `news_update`, `calendar_update`, `credits_update`, `logout`, heartbeat.

### 2.3 `POST /api/v1/auth/oauth/exchange`
- Request: `{ "code": "<one-time-code>" }` (JSON body). Rate limit: authLimiter per-IP 10/5 menit.
- `200` → `{ "sessionToken": "<64 hex>", "user": AuthUser }` — **shape persis `LoginSuccess`** (FE bisa langsung `loginWithToken(result.sessionToken)`).
- `400` → `{ "error": "Invalid or expired OAuth code", "code": "VALIDATION_ERROR", "requestId": "…" }` (code invalid/expired/terpakai/session sudah logout).
- `429` (rate limit) → `{ "error": "Too many requests", "code": "RATE_LIMITED" }`.

### 2.4 Redirect Google OAuth
- Setelah backend deploy: `{FRONTEND_URL}/auth/callback?code=<one-time-code>` — **bukan `?token=` lagi**. Code: single-use, TTL 5 menit.

---

## 3. ⚠️ Dua gotcha yang WAJIB dipahami sebelum nulis kode

### 3.1 EventSource reconnect = ticket sudah terbakar
Ticket **single-use + TTL 60s**. Saat koneksi putus (server restart, evicted, jaringan), EventSource **auto-reconnect dengan URL yang sama** — ticket lama sudah terpakai → `401` → reconnect gagal terus-menerus dengan URL basi.

**FE harus: minta ticket BARU setiap kali membuat/membuka ulang EventSource** (termasuk di handler `onerror`/reconnect). Pola:

```ts
// — pola umum (AuthContext & useTickerPrices) —
let es: EventSource | null = null;

async function connect() {
  try {
    const { ticket } = await authApi.getStreamTicket(sessionToken);
    es = new EventSource(`${BACKEND_URL}/api/v1/news/stream?ticket=${ticket}`);
    es.onopen = () => setIsConnected(true);
    es.onerror = () => {
      es?.close();
      setIsConnected(false);
      // Ticket lama basi — reconnect pakai ticket segar (backoff kecil)
      setTimeout(connect, 1000);
    };
    // ...event listeners (credits_update, logout, dst. tetap sama)...
  } catch {
    // Fetch ticket gagal (session mati) → stream tetap tertutup, JANGAN
    // retry loop — session invalid tidak akan membaik sendiri.
    setIsConnected(false);
  }
}
```

Catatan: `useTickerPrices.ts` **sudah punya reconnect/backoff** dari Phase 5 (recreate setelah 2s saat server-close) — tinggal disisipkan langkah "fetch ticket dulu" sebelum `new EventSource`. Jangan lupa: saat reconnect, **fetch ticket BARU** (jangan reuse).

### 3.2 Jangan fetch ticket jauh-jauh sebelum dipakai
TTL ticket hanya 60s. Fetch ticket → langsung buat EventSource dalam waktu dekat. Kalau ada jeda (mis. async state update), fetch-nya di dalam fungsi `connect()` seperti pola di atas — bukan di effect terpisah yang bisa basi.

---

## 4. Instruksi implementasi FE per file (kontrak proposal §7.2)

| # | File | Perubahan |
|---|---|---|
| 1 | `src/features/auth/api/authClient.ts` | Tambah `getStreamTicket()` (Bearer → `{ ticket }`, lempar `AuthApiError` kalau 401) dan `exchangeOAuthCode(code)` (POST `/auth/oauth/exchange` → `{ sessionToken, user }` bertipe `LoginSuccess`). |
| 2 | `src/features/auth/context/AuthContext.tsx` (~baris 69, effect SSE) | Ganti `new EventSource(...?token=${sessionToken})` → pola §3.1 (`getStreamTicket` → `?ticket=`). Kegagalan fetch ticket: **tutup stream, `isConnected=false`, JANGAN fallback ke `?token=`**. Reconnect (onerror): fetch ticket baru. Event `credits_update`/`logout` & cleanup `es.close()` tetap sama. |
| 3 | `src/features/market/hooks/useTickerPrices.ts` (~baris 71, `updateGlobalStream`) | Sama: `?token=` → fetch ticket → `?ticket=`. `updateGlobalStream` jadi async (atau panggil helper async). Reconnect yang sudah ada → fetch ticket baru. Kalau `getStreamTicket` 401 (session mati) → stream tetap tertutup. |
| 4 | `src/features/auth/pages/AuthCallbackPage.tsx` (~baris 12) | Baca `?code=` (bukan `?token=`) → `exchangeOAuthCode(code)` → `loginWithToken(result.sessionToken)` → navigate `/`. Tidak ada `code` → error seperti sekarang. (Backend tidak pernah kirim `?token=` lagi — jangan pertahankan path lama.) |
| 5 | `src/shared/lib/config.ts` + `vite.config.ts` | **CSP hardening (prod-only)** — murni frontend, **bisa dikerjakan SEKARANG tanpa menunggu apa pun**: plugin `transformIndexHtml` yang menulis ulang meta CSP **hanya saat `vite build`**: `script-src 'self' 'sha256-<hash-anti-clickjack>' https://*.tradingview.com https://*.tradingview-widget.com` (tanpa `'unsafe-inline'`). Dev TIDAK disentuh (React Fast Refresh butuh inline preamble `@vitejs/plugin-react` v4). Script anti-clickjacking tetap inline di `index.html`, diizinkan via hash (jangan dipindah ke file eksternal — risiko blank page). `style-src 'unsafe-inline'` tidak disentuh. |

---

## 5. Urutan rilis — PENTING

Backend siap deploy. **Setelah backend deploy, FE lama langsung rusak di 2 titik:**
1. SSE `?token=` → **400** (ticker/calendar/news mati).
2. Callback Google terima `?code=` yang tak bisa diproses → login Google gagal.

**⇒ Rilis backend + FE §2 harus bersamaan** (atau terima window singkat). Jangan deploy backend dulu lalu FE menyusul berhari-hari.

Urutan aman: (a) merge FE §2 → (b) deploy backend + FE bersamaan → (c) verifikasi checklist §6.

---

## 6. Checklist verifikasi FE (setelah deploy)

- [ ] Login biasa → chat + ticker tetap streaming; **Network tab: URL SSE pakai `?ticket=`, TIDAK ada `?token=`**.
- [ ] **Reconnect**: putuskan koneksi (server restart / devtools offline) → stream kembali dengan ticket baru (tanpa perlu refresh halaman).
- [ ] Login Google → redirect `/auth/callback?code=…` → masuk; **tidak ada session token di URL** (cek history/access log).
- [ ] Ticket basi: buka URL SSE dengan ticket yang sudah dipakai → 401 (bukan koneksi diam).
- [ ] Logout → tidak ada kredensial tersisa di localStorage.
- [ ] CSP prod: DevTools → tidak ada error CSP; widget TradingView tetap jalan; anti-clickjacking aktif.

---

## 7. Referensi backend (untuk debugging)

- `POST /auth/stream-ticket` → `GetStreamTicketUseCase` (TTL 60s) + `RedisStreamTicketStore` (key `stream_ticket:<ticket>`).
- `news/stream` auth → `streamAuth.middleware.ts` (burn ticket → validasi session live).
- `POST /auth/oauth/exchange` → `ExchangeOAuthCodeUseCase` + `RedisOAuthCodeStore` (key `oauth_code:<code>`, TTL 5 menit).
- Redirect OAuth → `AuthController.googleCallback` (buat code → redirect `?code=`).
- Semua fallback `req.query.token` di `auth.middleware.ts`/`guestMiddleware` **sudah dihapus** — token sesi tidak diterima di URL di route mana pun.
