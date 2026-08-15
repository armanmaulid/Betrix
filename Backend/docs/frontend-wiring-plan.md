# Plan: Wiring Backend → Frontend (Vite Architectured)

> Status: **EKSEKUSI SEBAGIAN — M1 & M3 selesai (2026-08-15); W1–W4 belum** · Dibuat 2026-08-15
> Prasyarat yang sudah ada: **Database & Redis ON**. Backend DDD refactor selesai (Phase 0–8 + follow-up rename/any-cleanup) — tsc 0, lint 0/0, boundary 0, test 51 (7 files), coverage 80%.
> Progress: **M1** (getSessions → `data.sessions`) ✅ · **M3** (`fetchUserCredits` dead code, dihapus) ✅ — lihat tabel mismatch di bawah.

---

## 0. Konteks

Backend sudah selesai refactor DDD (internal, API surface tidak berubah secara sengaja). Tugas ini: **memastikan Frontend - Vite (Architectured) benar-benar ter-wire ke backend** — kontrak API cocok, alur login/SSE/realtime jalan, dan semua fitur bisa dites end-to-end dengan DB & Redis yang sudah ON.

### Stack & cara jalan

| Komponen | Port | Cara jalan |
|---|---|---|
| Backend (Express) | 3000 | `npm run dev` (root Backend) |
| Frontend (Vite) | 5173 | `npm run dev` (di `Frontend - Vite (Architectured)`) |
| Postgres | — | **sudah ON** |
| Redis (Upstash REST) | — | **sudah ON** |
| MT5 bridge/EA (WS 8890) | — | **tergantung — cek** (sumber data realtime price/calendar) |

- Frontend memanggil backend **langsung via absolut URL**: `import.meta.env.VITE_API_URL || "http://localhost:3000"` + `/api/v1/...` (6 client: `authClient`, `chatClient`, `marketClient`, `newsClient`, `usageClient`, `useTickerPrices`).
- Satu koneksi SSE shared: `GET /api/v1/news/stream?token=<sessionToken>` — frontend mendengarkan event: `price_update`, `ohlc_update`, `news_update`, `calendar_update`, `credits_update`, `logout`, `connected`.
- Vite proxy `/api` di `vite.config.ts` **tidak terpakai** (semua client pakai URL absolut) — kandidat cleanup opsional.

---

## 1. Hasil Audit Kontrak (sudah diverifikasi dari kode — 2026-08-15)

### ✅ Cocok (tidak perlu disentuh)

| Feature | Endpoint FE → BE | Catatan |
|---|---|---|
| Auth register/login/logout/logout-by-credentials/resend | `/api/v1/auth/*` | Path, method, body cocok |
| Auth me / profile / password / email | `/api/v1/auth/{me,profile,password,email}` | Response `{ user }`, `{ pendingEmail }` cocok |
| Google OAuth | `/api/v1/auth/google` + callback → redirect `{FRONTEND_URL}/auth/callback?token=` | Route `/auth/callback` sudah ada di FE (`AuthCallbackPage` → `loginWithToken`) |
| Chat stream (SSE) | `POST /api/v1/chat/stream` | Format FE & BE cocok: `data:{token}`, `event: done`, `event: error` |
| Chat history / delete | `/api/v1/chat/history`, `/api/v1/chat/session/:id` | Cocok |
| Market symbols | `/api/v1/market/symbols` | Cocok |
| Market OHLC | `/api/v1/market/ohlc/:symbol/:tf`, `/api/v1/market/ohlc/all?timeframe=D1` | Response `{ candles }` / `{ ohlc }` cocok |
| Market calendar | `/api/v1/market/calendar?fromDate&toDate` | Mapping `eventTime/eventName/importance` cocok |
| News list | `/api/v1/news` | Response `{ news }`, field camelCase cocok dengan `NewsItem` |
| Messages | `/api/v1/me/messages` (+sent/thread/read/delete/prefs) | `GetMessagesUseCase` kini kirim `from/to` — cocok dengan interface `Message` FE |
| Usage | `/api/v1/me/usage/me?days=30` | `GetUsageUseCase` → `{ period, summary, byTaskType, dailyUsage }` cocok dengan `UsageSummary` FE |
| Health | `GET {BACKEND_URL}/health` (StatusBar) | Ada 2: `/health` (root, sebelum rate-limit) & `/api/v1/health` ✓ |
| SSE events | `news/stream` | Semua event yang FE dengarkan di-broadcast BE: `price_update` (MarketDataService), `calendar_update` (CalendarService), `news_update` (StoreNewsUseCase), `credits_update` (PgCreditRepository), `logout` (UpdateUser/ResetUserPassword) ✓ |

### ❌ Mismatch yang harus diperbaiki (W2)

| # | Masalah | Bukti kode | Arah fix yang disarankan |
|---|---|---|---|
| **M1** | ~~`getSessions` response key salah~~ | BE: `AuthController.getSessions` → `res.json({ sessions })`. FE dulu baca `data.devices` → selalu `undefined`. | ✅ **SELESAI** — `authClient.getSessions` baca `data.sessions` (2026-08-15). SettingsPage (satu-satunya konsumen) ikut benar; typecheck FE hijau. Interface `DeviceSession` dipertahankan `{ fingerprint, lastSeenAt }` (cukup untuk render). |
| **M2** | **`GOOGLE_CALLBACK_URL` salah path** | `env.example` (dan kemungkinan `.env`) = `http://localhost:3000/api/auth/google/callback`, tapi route asli = `/api/v1/auth/google/callback` → Google login pasti gagal `redirect_uri_mismatch`. | Update `.env` + `.env.example` → `http://localhost:3000/api/v1/auth/google/callback`. |
| **M3** | ~~`fetchUserCredits` selalu 0~~ | FE `usageClient.fetchUserCredits` baca `data.credits ?? data.totalTokens` dari `/me/usage/current-month`, tapi BE `getUsage` mengembalikan usage summary (tanpa `credits` top-level). | ✅ **SELESAI** — `fetchUserCredits` adalah **dead code** (0 import di seluruh FE). Dihapus dari `usageClient.ts` (2026-08-15). Sumber credits yang benar tetap `user.credits` dari `/auth/me` (`toUserResponseDto` sudah menyertakannya). |
| **M4** | `BrokerSymbol.trade_mode` tidak ada di BE | FE `marketClient.fetchBrokerSymbols` → `trade_mode: number`; BE `BrokerSymbol` entity punya `isActive`. | Verifikasi pemakaian di UI; jika tidak dipakai, hapus field dari interface FE (low priority). |

### ⚠️ Tergantung runtime (bukan bug — perlu diverifikasi saat test)

- **SSE `price_update` / `calendar_update`** butuh sumber data: `Mt5WebsocketClient` (EA, WS `MT5_WS_URL`/`MT5_BRIDGE_URL`) + `Mt5HttpClient` (fetch awal). Jika EA/bridge **mati**, stream tetap terbuka tapi tidak ada event — pastikan FE degradasi dengan anggun (polling REST fallback: `/market/ohlc/all`, `/market/calendar` dari DB).
- **`calendar-race.test.ts`** (integration, butuh DB live) — bisa dijalankan manual `npx tsx calendar-race.test.ts` sebagai sanity check DB.
- **Register** mengirim `sessionToken` + `user` (jika langsung login) — FE `register()` hanya baca `{ message }` ✓ tidak masalah.

---

## 2. Fase Eksekusi

### Phase W1 — Baseline & smoke test (DB/Redis ON)

1. Cek `.env` backend: `DATABASE_URL`, `UPSTASH_REDIS_REST_URL/TOKEN`, `PORT=3000`, `ALLOWED_ORIGINS` berisi `http://localhost:5173`, `GOOGLE_CALLBACK_URL` (perbaiki M2 di sini atau W2).
2. Start backend (`npm run dev`) → verifikasi log: "Server started on port 3000", koneksi DB & Redis OK, `runStartupJobs` tidak error.
3. Smoke: `curl localhost:3000/health` → `{"status":"ok"}`.
4. Start frontend (`npm run dev` di folder FE) → buka `http://localhost:5173` → pastikan tidak ada error CORS di console saat login.
5. **DoD W1:** backend & FE jalan, `/health` 200, CORS OK.

### Phase W2 — Perbaikan kontrak (3 fix konkret)

1. **M1** — FE `authClient.getSessions`: `data.devices` → `data.sessions`; update interface `DeviceSession`; cek render di `SettingsPage`.
2. **M2** — `.env` + `.env.example`: `GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback`.
3. **M3** — verifikasi pemakaian `fetchUserCredits`; perbaiki sumber credits.
4. (Opsional) M4 + cleanup `vite.config.ts` proxy (ubah target jadi `http://localhost:3000` + `rewrite: p => p.replace(/^\/api/, '/api/v1')`, atau hapus jika tidak dipakai).
5. **DoD W2:** `npx tsc --noEmit` hijau di FE & BE; lint FE 0 error; tidak ada perubahan perilaku backend (kecuali M2 env).

### Phase W3 — End-to-end test matrix (DB & Redis ON)

Urut per feature, catat hasil di report:

| # | Fitur | Langkah | Kriteria sukses |
|---|---|---|---|
| 1 | Auth register | Daftar email baru | 201, email terkirim (SMTP) atau pesan generik; cek DB `users` |
| 2 | Auth login | Login benar/salah | 200 + `sessionToken`; 401/403/429 sesuai skenario (needsVerification, hasActiveSession) |
| 3 | Auth me/sessions | `/auth/me`, `/auth/sessions` | **M1 terverifikasi**: daftar device tampil di SettingsPage |
| 4 | Auth password/email | Ganti password, email | 200, sesi lain di-logout (event `logout`) |
| 5 | Google OAuth | Klik "Login with Google" | **M2 terverifikasi**: redirect ke `/auth/callback?token=` lalu masuk |
| 6 | SSE live | Buka halaman dengan ticker/calendar/news sambil EA/bridge ON | Event `price_update`/`calendar_update`/`news_update` muncul realtime |
| 7 | Chat | Kirim pesan via `/chat/stream` | Token stream keluar per-chunk, `event: done` menutup; kredit terpotong (event `credits_update`) |
| 8 | Market | Ticker baseline (`ohlc/all D1`), calendar (`/market/calendar`) | Angka & daftar event tampil |
| 9 | News | List + realtime | Artikel tampil, update realtime |
| 10 | Messages | Kirim/baca/hapus pesan internal | List inbox + detail + unread count |
| 11 | Usage | Halaman usage (`/me/usage/me`) | Summary/byTaskType/dailyUsage tampil |
| 12 | Health/StatusBar | Pantau indikator ENGINE/CONN | Status koneksi akurat |

> Catatan: item yang butuh MT5 EA/bridge (6) — jika bridge mati, tandai "N/A (bridge off)" dan verifikasi fallback REST saja.

### Phase W4 — Verifikasi & dokumentasi

1. FE: `npm run build` (tsc -b + vite build) hijau; `npm run typecheck` 0 error.
2. BE: `npx tsc --noEmit`, `npm run lint` (0/0), `npm test` (51) tetap hijau.
3. Update `docs/session-context.md` (tambah catatan wiring + angka) & simpan report W3 di dokumen ini.
4. **DoD W4:** semua mismatch M1–M4 beres (atau ter-dokumentasi sebagai wont-fix), test matrix hijau, kedua repo typecheck.

---

## 3. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Google OAuth butuh kredensial asli | Jika `GOOGLE_CLIENT_ID` kosong, passport skip strategy (sudah ada guard) — login Google ditandai "N/A" di test matrix, tidak memblokir fitur lain |
| MT5 EA/bridge mati → SSE kosong | Dokumentasikan sebagai N/A; verifikasi fallback REST; jangan ubah logika FE realtime tanpa perlu |
| Perubahan FE merembet (banyak file pakai `data.devices` dll.) | Fix M1–M3 minimal & terisolasi di client layer; jangan refactor komponen |
| CORS di environment selain 5173 | Pastikan `ALLOWED_ORIGINS` berisi port yang dipakai (5174 dst.) |

---

## 4. Keputusan & status

1. **M1** — ✅ **DIEKSEKUSI 2026-08-15**: fix di FE (`data.sessions`), sesuai rekomendasi (backend sudah benar pasca-refactor).
2. **M3** — ✅ **DIEKSEKUSI 2026-08-15**: `fetchUserCredits` ternyata **tidak dipakai** (0 import) → dihapus. Credits bersumber dari `user.credits` (`/auth/me`).
3. **Scope** — ⏳ **TERSISA**: eksekusi W1→W4 (baseline, M2/M4, test matrix E2E, verifikasi & docs) dengan DB/Redis yang sudah ON.
