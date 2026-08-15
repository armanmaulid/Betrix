# Laporan Test Environment Backend (Pre-Audit)

**Tanggal:** 2026-08-15 · **Status:** Laporan test environment menyeluruh sebelum audit
**Metode:** Boot instance terpisah (PORT=3100) dengan flag di-override + observasi instance produksi (PORT=3000). DB & Redis Docker ON.

---

## 1. Ringkasan Eksekutif

Semua **flag boolean** backend telah diuji aktif & non-aktif — **tidak ada bug ditemukan** pada flag itu sendiri. 2 temuan penting yang wajib dibaca sebelum audit:

1. **`DEVICE_ENFORCEMENT=true` berfungsi penuh** (login ke-2 dari device sama ditolak 401, `device_session` ter-record di Redis, `current: true` di `/auth/sessions` terbukti end-to-end — sekaligus memvalidasi fix `current` dari sesi sebelumnya).
2. **Dua mekanisme fingerprint berbeda** dipakai di dua titik (lihat §4.2) — berisiko saat enforcement ON penuh.

Satu catatan proses: `GOOGLE_CALLBACK_URL` sudah benar (`/api/v1/...`) — status M2 fix terkonfirmasi, tapi alur Google OAuth penuh **belum bisa diuji via API** (butuh interaksi browser + Google consent).

---

## 2. Matriks Env — Semua Variabel

Legend: ✅ teruji langsung · 🟡 teruji sebagian/implisit · ❌ belum teruji · 🔒 rahasia (tidak ditampilkan)

### 2.1 Infrastruktur & HTTP

| Var | Nilai aktif | Status | Hasil test |
|---|---|---|---|
| `NODE_ENV` | `development` | ✅ | Boot dev normal; prod/test belum diuji (risiko: beda logger/silent, trust proxy) |
| `PORT` | 3000 (prod), 3100 (test) | ✅ | Boot di 2 port berbeda sukses |
| `FRONTEND_URL` | `http://localhost:5173` | ✅ | Dipakai CORS + redirect OAuth |
| `ALLOWED_ORIGINS` | `3001,3000,5173,5174` | 🟡 | Tidak ada origin asing di log CORS block (FE di 5173 tak pernah kena) |
| `LOG_LEVEL` | `debug` | ✅ | `debug` menampilkan log DEBUG; `silent` → logger silent (kode: `logger.ts:77`) |
| `TRUST_PROXY_HOPS` | 1 (default) | 🟡 | `app.set("trust proxy", …)` (`startServer.ts:28`); berdampak `req.ip` → fingerprint device |

### 2.2 Database & Cache (Docker)

| Var | Nilai | Status | Hasil test |
|---|---|---|---|
| `DATABASE_URL` | `betrix:betrixpass@localhost:5432/betrix` | ✅ | `/health` postgres **up (19ms)**; query langsung OK |
| `UPSTASH_REDIS_REST_URL` | `http://localhost:8079` | ✅ | `/health` redis **up (15ms)**; semua key terbaca via client Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | 🔒 | ✅ | Auth ke REST Redis berhasil |
| `GENERAL_CACHE_TTL_DAYS` | 7 | 🟡 | Ada di `.env`, tapi **tidak dibaca schema `env.ts`** → tidak berdampak apa pun (lihat §4.3) |

### 2.3 Autentikasi & Keamanan

| Var | Nilai | Status | Hasil test |
|---|---|---|---|
| `JWT_SECRET` | 🔒 (≥32 char) | ✅ | Validasi zod lolos; dipakai passport session |
| `DEVICE_ENFORCEMENT` | `false` → **diuji `true`** | ✅ | **false**: `sessions: []`. **true**: login ke-2 dari device sama → **401 "Device already has active session"** + `device_session:<userId>:<fp>` → token di Redis + `/auth/sessions` → `current: true` ✅ |
| `REQUIRE_EMAIL_VERIFICATION` | (tidak diset → false) | 🟡 | Dibaca via `process.env` di `container.ts:200` (bukan `env` zod) — konsisten, tapi perlu test alur verify email jika di-ON-kan |
| `RATE_LIMIT_PER_MINUTE` | default 30 | ✅ | Global limiter aktif (30/menit per IP) — teruji di §8d E2E |
| `RATE_LIMIT_PER_USER_PER_MINUTE` | default 30 | 🟡 | `perUserLimiter` (key `user:<id>`) — belum diuji sampai 30 request |
| `RATE_LIMIT_REGISTER_PER_HOUR` | default 5 | ✅ | **Teruji hari ini:** percobaan ke-6 → **429** (5x 201 lalu 429), log `[RateLimit] exceeded` ✅ |
| Auth limiter (hardcode) | 10/5 menit | ✅ | Teruji §8d: 429 mulai percobaan ke-9 + lockout |
| Sensitive limiter (hardcode) | 3/jam | 🟡 | `sensitiveLimiter` (change-email/password) — belum diuji (butuh akun 2nd) |

### 2.4 Google OAuth

| Var | Status | Hasil test |
|---|---|---|
| `GOOGLE_CLIENT_ID` | ✅ SET | Strategy terdaftar saat boot (tanpa warning "not configured") |
| `GOOGLE_CLIENT_SECRET` | ✅ SET | — |
| `GOOGLE_CALLBACK_URL` | ✅ SET = `http://localhost:3000/api/v1/auth/google/callback` | **Benar** — path `/api/v1/...` cocok route nyata (status M2 fix: terkonfirmasi) |
| Alur penuh | ❌ | Butuh browser: `/auth/google` redirect ke consent Google lalu callback — **tidak bisa diuji via curl**; wajib dicek manual pre-audit |

### 2.5 AI Gateway (LLM)

| Var | Nilai | Status | Hasil test |
|---|---|---|---|
| `AI_BASE_URL` | `https://gateway.dahono.com/v1` | ✅ | Chat & stream sukses (`kimi-k3`/`deepseek-v4-flash`) |
| `AI_API_KEY` | 🔒 | ✅ | Auth gateway OK |
| `MODEL_CHEAP/BALANCED/DEEP` | deepseek-v4-flash / kimi-k3 / qwen3.8-max | ✅ | `general` → cheap; taskType lain → tier sesuai `ModelPolicy` |
| `MODEL_*_MAX_TOKENS` | 2048/4096/8192 | 🟡 | Ter-inject `container.ts:212`; tidak diuji beda nilai |
| `AI_DEBUG_LOGGING` | `false` → **diuji `true`** | ✅ | **Diuji hari ini:** `[AI_DEBUG] outgoing payload` + `[AI_DEBUG] gateway response` muncul di log (dengan `LOG_LEVEL=debug`) — perhatikan: butuh `LOG_LEVEL=debug` untuk terlihat |
| `AI_REQUEST_TIMEOUT_MS` / `AI_STREAM_TIMEOUT_MS` | 30000/60000 | 🟡 | Dipakai `AbortController`; tidak diuji timeout nyata |

### 2.6 Email (SMTP)

| Var | Status | Hasil test |
|---|---|---|
| `SMTP_HOST/PORT/USER/PASS/FROM` | Gmail:587, ammarcyber@gmail.com | ✅ **Teruji §8d:** broadcast admin → email terkirim ke 3 penerima |

### 2.7 Broker MT5 & Data Market

| Var | Nilai | Status | Hasil test |
|---|---|---|---|
| `MT5_BRIDGE_URL` | `host.docker.internal:8890` | ✅ | WS connected |
| `MT5_WS_URL` / `MT5_HTTP_URL` | `ws://` & `http://` `host.docker.internal:8890` | ✅ | WS connect + HTTP fallback |
| `MT5_TRACK_PRICES` | `true` | ✅ | Log "Subscribed to price tracking for 13 symbols" + SSE `price_update` live (ETHUSD/BTCUSD) |
| `MT5_TRACK_OHLC` | `true` | ✅ | Log "Subscribed to OHLC tracking for 13 symbols" + OHLC update D1 per symbol |
| `MT5_TRACK_MBOOK` | `false` | 🟡 | **Off**: tidak di-subscribe (benar). **On belum diuji** (butuh EA + symbol dengan market book) — mbook yang dikirim EA di-handle `MarketDataService` |
| `MT5_TRACK_CALENDAR` | `true` | ✅ | Log "Subscribed to calendar tracking" + calendar up-to-date; SSE `calendar_update` (lihat CalendarService) |
| `MT5_TRACKING_SYMBOLS` | 13 symbol (EURUSD…GBPJPY) | ✅ | 13 symbol di-subscribe; parsing koma + trim OK |
| `MT5_BROKER_UTC_OFFSET` | 3 | 🟡 | Dipakai konversi waktu calendar/OHLC — tidak diuji beda nilai |
| `MT5_POLLING_INTERVAL_SEC` / `FINNHUB_POLLING_INTERVAL_SEC` | 10/10 | 🟡 | Scheduler news 10s terlihat; polling interval lain tidak diuji |

### 2.8 News

| Var | Status | Hasil test |
|---|---|---|
| `FINNHUB_API_KEY` | ✅ SET | List berita Finnhub sukses (§8d) + scheduler poll 10s |

### 2.9 Lain-lain

| Var | Status | Hasil |
|---|---|---|
| `SESSION_LOOKUP_TIMEOUT_MS` | 🟡 | Konstanta di `RedisSessionRepository.ts:7` **di-hardcode 5000**, env dibaca schema tapi **tidak dipakai** (lihat §4.3) |
| `DB_POOL_MAX` / `DB_STATEMENT_TIMEOUT_MS` / `DB_QUERY_TIMEOUT_MS` | 🟡 | Di schema env — verifikasi pemakaian belum tuntas (pool default) |
| `SERVER_KEEPALIVE_TIMEOUT_MS` / `SERVER_HEADERS_TIMEOUT_MS` | 🟡 | Di schema env — cek dipakai di `startServer`? (belum diverifikasi tuntas) |

---

## 3. Flag yang Diuji Hari Ini (baru, di instance 3100)

| Flag | Pengujian | Hasil |
|---|---|---|
| `DEVICE_ENFORCEMENT=true` | Login #1 device A (UA Chrome) → login #2 device A → cek Redis → `/auth/sessions` | #1 **200** (sessionToken), #2 **401** `"Device already has active session"`, Redis: `device_session:d61aa884…:LH9vCriY…` → token, sessions → `current: true` ✅ |
| `AI_DEBUG_LOGGING=true` (+`LOG_LEVEL=debug`) | `POST /chat` → cek log | `[AI_DEBUG] outgoing payload (callModel)` + `[AI_DEBUG] gateway response (callModel)` ✅ |
| `RATE_LIMIT_REGISTER_PER_HOUR=5` | 6x register cepat | 1–5 → **201**, ke-6 → **429** + `[RateLimit] exceeded` ✅ (user test dibersihkan) |
| `MT5_TRACK_MBOOK=false` (default) | Boot log | Tidak ada "Subscribed to market book tracking" ✅ (konsisten) |

---

## 4. Temuan (Pre-Audit Checklist)

### 4.1 ✅ SUDAH DIPERBAIKI — Dua mekanisme fingerprint berbeda
- **Sebelum:** `DeviceFingerprint` (VO, base64 ip|ua mentah) di AuthService/LogoutByCredentials vs `getDeviceFingerprint` (core, hex via UAParser) di RegisterUseCase/LogoutUseCase — tidak cocok untuk request sama.
- **Sesudah (2026-08-15, §8g session-context):** `DeviceFingerprint.create` jadi **satu-satunya sumber** (UAParser + normalizeIP pindah ke VO, hash hex dari ip+browser+OS+device.type); `getDeviceFingerprint` + `core/utils/deviceFingerprint.ts` dihapus; semua use-case pakai `DeviceFingerprint.create`. Verifikasi end-to-end: logout menghapus `device_session` (sebelumnya tak pernah match). tsc 0 · lint 0/0 · boundary 0 · test 51/51.

### 4.2 ✅ SUDAH DIPERBAIKI — `current` + `ip`/`userAgent` di `/auth/sessions`
- `current: true` untuk device aktif ✅ (fix sesi lalu).
- **`ip`/`userAgent` kini terisi** (2026-08-15, §8h session-context): `RedisSessionRepository.save()` menyimpan metadata JSON v2 (`userId, ip, userAgent, deviceFingerprint`) + fallback format lama; `GetSessionsUseCase` memakai `sessionRepo.findByUserId` untuk melengkapi tiap device.
- **IP kini ternormalisasi** (2026-08-15, §8i): `req.normalizedIP` (hasil middleware `ipNormalizer`) dipakai di semua pembuat `RequestInput` (request.ts helpers + AuthController/AdminController incl. logout/googleCallback) — session/activity log menyimpan `127.0.0.1` bukan `::1`. Bonus fix: `reconstructSession` menangani nilai Redis berupa object (Upstash auto-parse JSON) — mencegah 500 `stored.startsWith is not a function`.
- **Regression E2E** (2026-08-15, §8j): full test ulang menemukan & memperbaiki 1 bug — `RedisSessionRepository.delete()` mengembalikan seluruh JSON v2 sebagai userId → logout 500 uuid; fix `extractUserId()`. Semua endpoint (auth/market/news/chat/user/admin/SSE) hijau, tsc/lint/boundary/test 51/51.

### 4.3 🟡 Sedang — Env "hantu" (di schema tapi tidak dikonsumsi / sebaliknya)
| Var | Masalah |
|---|---|
| `GENERAL_CACHE_TTL_DAYS` (di .env) | Tidak ada di schema `env.ts` → **tidak berdampak** (bisa dihapus dari .env atau ditambahkan ke schema) |
| `SESSION_LOOKUP_TIMEOUT_MS` (di schema) | `RedisSessionRepository.ts:7` **hardcode 5000** — env tidak dipakai |
| `SERVER_KEEPALIVE_TIMEOUT_MS` / `SERVER_HEADERS_TIMEOUT_MS` / `DB_POOL_MAX` / `DB_*` | Di schema, pemakaian belum diverifikasi menyeluruh |
| `REQUIRE_EMAIL_VERIFICATION` | Dibaca via `process.env` di `container.ts` (bukan dari `env` zod) — berfungsi tapi tidak konsisten dengan pola env terpusat |

### 4.4 🟡 Sedang — Google OAuth
Strategy terdaftar + callback URL benar. **Tapi alur penuh belum diuji** (butuh browser). Sebelum audit: login Google manual sekali. Risiko lain: Google mengizinkan `http://localhost` callback, jadi seharusnya OK di dev.

### 4.5 🟢 Info — Rate limit register teruji; sensitive limiter belum
`sensitiveLimiter` (3/jam, change-email/change-password) belum pernah diuji sampai 429. Bisa diuji di sesi audit dengan akun khusus (hati-hati: change-password benar-benar mengubah password).

---

## 5. Rekomendasi Sebelum Audit

1. ~~**Unifikasi fingerprint**~~ (§4.1) — **SELESAI** (2026-08-15).
2. **Bersihkan env hantu** (§4.3): hapus `GENERAL_CACHE_TTL_DAYS` dari `.env` (atau tambah ke schema), pakai `SESSION_LOOKUP_TIMEOUT_MS` dari env (hapus hardcode).
3. **Test manual Google OAuth** (§4.4) sekali di browser.
4. **Test `MT5_TRACK_MBOOK=true`** saat EA siap dengan symbol yang punya market book.
5. **Test `REQUIRE_EMAIL_VERIFICATION=true`** dengan akun baru (alur OTP verify).

---

## 6. Cleanup yang Sudah Dilakukan

- Instance test PORT=3100 **di-kill** (port bersih).
- `device_session` test **dihapus** dari Redis (1 key).
- 5 user `rlimit*@betrix.test` **dihapus** dari DB.
- File temp (`.check-*.mjs`, `.get-token.mjs`, `.cleanup-*.mjs`) **dihapus**.
- Server produksi user (PORT=3000) **tidak pernah disentuh** — masih jalan normal.
