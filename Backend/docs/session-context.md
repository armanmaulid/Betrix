# Session Context — Betrix Backend (DDD Refactor)

> **Fungsi dokumen ini:** snapshot lengkap konteks percakapan AI coding dari awal sampai sekarang.
> Dibuat: 2026-08-15. Dipakai untuk **resume percakapan** tanpa kehilangan konteks.
>
> **Cara resume:** baca file ini dulu (state, keputusan, gotcha), lalu `docs/ddd-refactor-plan.md`
> (refactor DDD, semua fase selesai) dan `docs/bugfix-plan.md` (11 bug, SEMUA phase selesai).
> **Status 2026-08-16:** DDD refactor ✅ + 11/11 bug ✅ + semua pesan user-facing konsisten
> Bahasa Inggris (§8q) + follow-up Phase 5 selesai (googleId reclaim + E2E live, §8r).
> Verifikasi final: tsc 0 · lint 0/0 · boundary 0 · test **9 files / 62 tests / 0 failed**.

---

## 1. Apa proyek ini

- **Betrix Backend** — backend + AI orchestration untuk platform signal forex AI.
- Stack: Node 20+ / TypeScript ESM (ES2022, moduleResolution bundler), Express 4, PostgreSQL (`pg` mentah), Upstash Redis, tsyringe (DI), zod, passport-google-oauth20, nodemailer, winston, vitest, ESLint 9 flat config.
- Path alias (tsconfig): `@/*`, `@config/*`, `@core/*`, `@domain/*`, `@contexts/*` (baru Phase 7), `@data/*`, `@application/*`, `@presentation/*`, `@bootstrap/*`, `@background/*`, `@infrastructure/*`.
- Jalankan: `npm run dev` (tsx watch), `npm run build` (tsc + tsc-alias), `npm start`.
- Verifikasi: `npx tsc --noEmit`, `npm run lint`, `npm test` (vitest, pattern `src/**/*.test.ts`), `npm run lint:fix`.

---

## 2. Permintaan user & hasil assessment awal

**Permintaan awal:** "Apa backend ini sudah memenuhi standar DDD?"

**Verdict: ±75% — "arsitektur berlapis bergaya DDD"** (bukan DDD murni):
- ✅ Sudah benar: 4 lapis (domain/application/data/presentation), repository interface di domain, entity berperilaku (`User.canLogin()`, `CalendarEvent.withUpdatedValues()`), value objects (`Email`, `DeviceFingerprint`, `SessionToken`), use case kecil, DI tsyringe, ports & adapters.
- ❌ Pelanggaran yang ditemukan saat assessment:
  1. Ports salah letak di `application/ports` + **domain meng-import keluar** (`@application/ports`, `@core/*`, `@config/*`).
  2. `CalendarService`/`AuthDomainServiceImpl` = application service yang nyamar jadi domain service.
  3. SMTP duplikat (`domain/services/emailService.ts` = duplikat `data/external/EmailService.ts`), dipakai 3 use case melewati `EmailPort`.
  4. Use case baca `process.env`/`@config/*` langsung.
  5. Controller pakai service locator (`container.resolve` di dalam method) + banyak `as any`; `serializeUser()` duplikat manual.
  6. Interface mati: `ChatDomainService`, `AuthDomainService` (0 konsumen).
  7. Tidak ada bounded context.

**Permintaan berikutnya:** "buatkan plan dan reportnya bagi per-phase" → `docs/ddd-refactor-plan.md` dibuat (9 fase, tiap fase punya template report Eksekusi/Verifikasi/Temuan/DoD). Lalu user meminta eksekusi fase demi fase: 1 → 2 → 3 → 4 → 5 → 6 → 7.

---

## 3. Status fase (state 2026-08-15)

| Fase | Nama | Status | Bukti |
|---|---|---|---|
| 0 | Baseline & Assessment | ✅ | `docs/ddd-refactor-plan.md` §2 |
| 1 | Dependency Guardrail (ESLint boundary) | ✅ | `eslint.config.js` + report |
| 2 | Ports → `domain/ports` | ✅ | boundary 19 → 11 |
| 3 | Infrastruktur keluar dari domain (SMTP) | ✅ | boundary 11 → 5 |
| 4 | Reklasifikasi service → `application/services` | ✅ | boundary 5 → 0 (milestone) |
| 5 | Konfigurasi via injection (`AppSettings`) | ✅ | 0 `process.env`/`@config` di application+domain |
| 6 | Controller DI & hilangkan `any` | ✅ | 0 `container.resolve` di method controller, 0 `no-explicit-any` di controllers |
| 7 | Bounded Context (konteks pertama: `news`) | ✅ | `src/contexts/news/` + guardrail konteks |
| 8 | Test coverage & lint hijau | ✅ | `npm test` 6 file/41 test, `npm run lint` 0 error, coverage 80% |

**Angka terakhir (akhir Phase 8 + follow-up rename/any-cleanup — SEMUA FASE SELESAI):**
- `npx tsc --noEmit` → **0 error** ✅
- `npm run lint` → **0 problems (0 errors, 0 warnings)** ✅ (83 warning `no-explicit-any` lama sudah dihapus lewat follow-up tipe konkret)
- boundary (`import/no-restricted-paths`) → **0** ✅
- `npm test` → **7 files / 51 tests / 0 failed** ✅ (vitest pattern `src/**/*.test.ts`; `calendar-race.test.ts` di root TIDAK ikut — integration, butuh DB, jalankan manual `npx tsx calendar-race.test.ts`)
- Coverage → **80.16% statements / 80.08% lines** ✅ (target 30%)

---

## 4. Ringkasan perubahan per fase (apa yang sudah diubah)

### Phase 1 — Guardrail
- `eslint.config.js`: flat config, plugin `import`, resolver `eslint-import-resolver-typescript@4.4.5` (devDep), rule `import/no-restricted-paths`.
- Zone: `target: ./src/domain` ← `from: application/config/core/data/infrastructure/presentation` + zone `@core` dengan `except: ["./errors"]` (keputusan Phase 3: domain hanya boleh import `@core/errors`).

### Phase 2 — Ports pindah
- `git mv src/application/ports → src/domain/ports` (4 file: IBrokerProvider, INewsProvider, INotifier, index.ts).
- Update 26 file importer `@application/ports` → `@domain/ports`. Barrel `domain/ports/index.ts` = EmailPort, AiPort, CachePort, EventBusPort, AiMessage.

### Phase 3 — SMTP keluar dari domain
- Hapus `domain/services/emailService.ts` + export barrel.
- `EmailPort.sendEmail({to,subject,text?,html?})` ditambahkan (implementasi sudah ada di `data/external/EmailService.ts`).
- 3 use case (Broadcast, ResetUserPassword, user SendMessage) → `@inject("EmailPort")`.
- `AuthDomainServiceImpl`: `generateSecureToken(LIMITS)` → `SessionToken.generate()`; `isDeviceEnforcementEnabled()` keluar → param `enforceDevice` (caller: LoginUseCase + googleCallback).

### Phase 4 — Service direklasifikasi
- `git mv` 5 service → `application/services/`: `CalendarService`, `MarketDataService`, `SymbolService`, `NewsService`, `AuthDomainServiceImpl` (class tetap bernama `AuthDomainService`).
- Hapus 2 interface mati: `domain/services/ChatDomainService.ts` & `AuthDomainService.ts`.
- `domain/services` kini murni: `AiPromptRegistry`, `DeviceDomainService`, `thinkingFilter`.

### Phase 5 — Config via injection
- `src/core/settings/AppSettings.ts` (8 field: requireEmailVerification, deviceEnforcementEnabled, trackCalendar/trackPrices/trackOhlc/trackMbook, trackingSymbols, brokerUtcOffset).
- `src/domain/services/ModelPolicy.ts` (pure: TASK_TIER_MAP, TIER_CREDIT_COST, resolveTier/resolveModel/creditCost).
- Wire di `bootstrap/container.ts` (env dibaca HANYA di sini). 5 use case + 2 service diupdate. Hapus `src/config/models.ts`.

### Phase 6 — Controller DI
- 6 controller → `@injectable()` + `@inject("Token")` konstruktor: Auth, Chat, Admin, User, Market, News.
- `src/application/mappers/user.mapper.ts` (`toUserResponseDto`) menggantikan `serializeUser()`.
- Hapus semua `as any` di controllers (cast bertipe: `UserStatus`, `ChatTaskType`, `AdminActionType`, `Record<string, unknown>`, dll).
- `news.routes.ts`: `new NewsController()` → `container.resolve(NewsController)`.
- **Penting:** `CalendarService` di-register eksplisit di container (`"CalendarService"`) — sebelumnya hanya auto-resolve via class.

### Phase 7 — Bounded context `news`
- Struktur `src/contexts/news/{domain,application,infrastructure}` (9 file: NewsArticle, NewsRepository, INewsProvider, NewsContextPort, NewsService, FetchNewsUseCase, GetNewsUseCase, StoreNewsUseCase, PgNewsRepository, FinnhubNewsAdapter).
- **Port antar-konteks `NewsContextPort`** (`cleanupOlderThan`) — `SystemCleanupUseCase` (admin) inject `"NewsContextPort"` alih-alih `NewsRepository` langsung.
- Container: tambah `"NewsContextPort"`, path import ke `@contexts/news/...`.
- Barrel dibersihkan: `domain/entities`, `domain/repositories`, `data/repositories` (hapus export news).
- tsconfig: tambah `@contexts/*`.

### Phase 8 — Test coverage & lint hijau (FASE TERAKHIR)
- **Lint hijau**: lint:fix (10 auto) + 75 manual di 30 file → **0 errors** (83 warning `no-explicit-any` dipertahankan).
- **6 file test baru / 41 test**: value-objects (12), ModelPolicy (6), AiPromptRegistry (3), thinkingFilter (8), LoginUseCase (7), RegisterUseCase (5).
- **Follow-up ekstraksi (2026-08-15)**: `tagNewsArticle` pure function → `contexts/news/domain/newsTagging.ts` (dipakai `NewsService`, diuji 10 test). Total **7 files / 51 test**. Dead code fallback `"crypto"` (tak pernah reachable) **dihapus** — perilaku identik (crypto tetap → `"btc"`).
- **Follow-up rename + any-cleanup (2026-08-15)**: `AuthDomainService` → `AuthService` (git mv, token DI, konsumen). **83 `no-explicit-any` dihapus total** (0 warning; tipe konkret: augmentasi `Express.User`/`Request` di requestId.ts, row interface per repo PG, `Mt5RawMessage`, `FinnhubArticle`, `hasNestedShape`, `unknown`+narrowing di catch, `new Email` di passport).
- **vitest.config.ts**: tambah `resolve.alias` (11 alias) + `extensionAlias {".js": [".ts",".js"]}`.
- **Fix bug produksi**: `createThinkingStreamFilter` bocor saat tag terpecah antar chunk SSE → ditulis ulang chunk-safe (ditemukan oleh test).
- **Coverage 80%** (target 30%). `calendar-race.test.ts` tetap di root (integration, butuh DB; jalankan `npx tsx calendar-race.test.ts`).
- Guardrail baru di eslint: `src/domain` ← `src/contexts`; `contexts/news/domain` ← `contexts/news/{application,infrastructure}`; `contexts/news/domain` ← `@core` (except errors).
- README: pohon arsitektur diupdate.

---

## 5. Keputusan penting (JANGAN dibalik tanpa alasan)

1. **`@core/errors` = satu-satunya core yang boleh diimport domain** (opsi A). Di-enforce via `except: ["./errors"]` di kedua zone (domain global + domain konteks).
2. **Token DI string dipertahankan** (`"UserRepository"`, `"AuthDomainService"`, `"LogoutByCredentialsUseCase"`, `"SendUserMessageUseCase"`, `"UserDeleteMessageUseCase"`, `"NewsContextPort"`, dll.) — banyak controller/use case inject via string token yang harus match registrasi container.
3. **Rename `AuthDomainService` → `AuthService` SUDAH DIEKSEKUSI (2026-08-15)** — `git mv` ke `AuthService.ts`, token DI `"AuthService"`, konsumen (`LoginUseCase`, `AuthController`) di-update. Bersamaan: **83 warning `no-explicit-any` dihapus total** (lint 0 error + 0 warning).
4. **`@core/settings/AppSettings`** — env dibaca HANYA di `bootstrap/container.ts`; application & domain tidak boleh `process.env`/`@config/*`.
5. **`MarketDataService.getAllOHLC`/`getAllMarketBooks` masih return `Promise<any[]>`** — anotasi `any` di service, di luar scope Phase 6 (controllers). Cast `{ symbol: string }` dipakai di MarketController.
6. **Presentation boleh baca config** (`process.env.FRONTEND_URL` di AuthController.googleCallback, `@config/deviceEnforcement` di passport). DoD Phase 5 hanya application+domain.
7. **Bounded context `news` = template untuk konteks lain** (auth/chat/market belum dikerjakan — `User` di-share lintas konteks, butuh `UserContextPort`).

---

## 6. Gotcha teknis (hasil temuan — hemat waktu resume!)

1. **File ber-CRLF:** banyak file `.ts` pakai `\r\n`. `write_file` bisa **gagal** ("Failed to apply patch") di file CRLF → pakai `str_replace` berlapis (terbukti aman), atau periksa dulu dengan `od -c`/`git diff`.
2. **`except` di `no-restricted-paths` di-resolve relatif terhadap `from`** (bukan cwd): `except: ["./src/core/errors"]` gagal senyap; yang benar `except: ["./errors"]`.
3. **Glob `*` di `target`/`from` GAGAL di Windows** — minimatch tanpa `windowsPathsNoEscape` tidak cocok dengan path absolut (`D:\Betrix\...`). Jangan pakai `target: "./src/contexts/*/domain"`; gunakan zone **eksplisit per konteks**.
4. **`git mv` butuh direktori tujuan ada** — `mkdir -p` dulu, kalau tidak `git mv` berhenti di tengah chain (tidak ada file hilang, tapi perintah gagal).
5. **Cek guardrail tidak "mati senyap"** — setelah menambah zone, uji dengan file sementara yang sengaja melanggar lalu `rm`.
6. **`npm run lint` memakai npx eslint**: script `"lint"` di package.json; format JSON untuk analisis: `npx eslint src -f json 2>/dev/null | node -e "..."` (hindari regex backslash di bash — pakai string sederhana).
7. **tsyringe auto-registration vs string token:** `container.resolve(Class)` bekerja tanpa registrasi eksplisit untuk class `@injectable()`; `@inject("TokenString")` WAJIB terdaftar di container.

---

## 7. Perintah verifikasi yang dipakai tiap fase

```bash
npx tsc --noEmit 2>&1 | tail -10; echo "tsc-exit:${PIPESTATUS[0]}"
npm run lint 2>&1 | tail -3
# Hitung boundary & masalah (hindari regex backslash):
npx eslint src -f json 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);const errs=r.reduce((a,f)=>a+f.errorCount,0);const warns=r.reduce((a,f)=>a+f.warningCount,0);const b=r.reduce((a,f)=>a+f.messages.filter(m=>m.ruleId==='import/no-restricted-paths').length,0);console.log('errors:',errs,'warnings:',warns,'boundary:',b);})"
npm test 2>&1 | tail -15
```

---

## 8. Phase 8 — ✅ SELESAI (fase terakhir)

**Hasil akhir (2026-08-15):**
- `npm test` → **7 files / 51 tests / 0 failed** ✅ (6 file test baru di `src/**` + 1 follow-up `newsTagging.test.ts`)
- `npm run lint` → **0 errors, 0 warnings** ✅ (83 warning `no-explicit-any` lama dihapus lewat follow-up tipe konkret 2026-08-15)
- `npx tsc --noEmit` → **0 error** ✅
- Coverage → **80%** ✅ (target 30%)

**File test baru:** `src/domain/value-objects/value-objects.test.ts` (12), `src/domain/services/{ModelPolicy,AiPromptRegistry,thinkingFilter}.test.ts` (6+3+8), `src/application/use-cases/auth/{LoginUseCase,RegisterUseCase}.test.ts` (7+5).

**Yang dikerjakan:** lint:fix (10) + 75 error manual di 30 file (unused imports sisa refactor, `import type`, `no-namespace` dengan disable+alasan, `import()` type → `import type` di PgAnalyticsRepository); vitest.config.ts + `resolve.alias` (11 alias) + `extensionAlias .js→.ts`; **fix bug produksi** `createThinkingStreamFilter` (bocor saat tag terpecah antar chunk SSE — ditemukan test, ditulis ulang chunk-safe); `logResponse` kini memakai `level` terhitung (perilaku kecil membaik).

**Keputusan:** `calendar-race.test.ts` TETAP di root (integration butuh DB live; tidak ikut `npm test`; jalankan manual `npx tsx calendar-race.test.ts`).

---

## 8b. Frontend wiring — M1 & M3 selesai (2026-08-15)

Plan wiring lengkap: `docs/frontend-wiring-plan.md` (audit kontrak + W1–W4). Sebagian mismatch sudah dibereskan:

- **M1** ✅ — `getSessions`: BE sudah benar (`{ sessions }`); FE `authClient.getSessions` diubah `data.devices` → `data.sessions`. Satu-satunya konsumen `SettingsPage` ikut benar. Typecheck FE hijau.
- **M3** ✅ — `fetchUserCredits` di `usageClient.ts` ternyata **dead code** (0 import di seluruh FE) → dihapus. Sumber credits yang benar: `user.credits` dari `/auth/me` (`toUserResponseDto` sudah menyertakannya).
- **M2** ⏳ tersisa — `GOOGLE_CALLBACK_URL` env salah path (`/api/auth/...` vs route `/api/v1/...`).
- **M4** ⏳ tersisa — `BrokerSymbol.trade_mode` tidak ada di BE (low priority).
- **W1–W4** ⏳ belum dieksekusi (baseline, test matrix E2E, verifikasi & docs).

## 8c. W1 baseline — `npm run dev` boot test (2026-08-15) — 🐛 BUG DITEMUKAN & DIPERBAIKI

**Bug boot yang ditemukan smoke test:** `Cannot inject the dependency "registerUseCase" ... unregistered dependency token: "RegisterUseCase"` — backend mati saat `npm run dev`.

**Akar masalah (ESM hoisting + regresi refactor):** semua route file (`auth/chat/admin/market/news/user.routes.ts`) mengeksekusi `container.resolve(Controller)` di **module scope**. Karena `main.ts → startServer.ts → registerRoutes.ts → v1/index.ts → *.routes.ts` adalah static import yang di-hoist, file route dievaluasi **sebelum** `createApp()` memanggil `registerDependencies()` — jadi controller di-resolve dari container yang masih kosong. Refactor Phase 6/7 membungkus registrasi ke fungsi `registerDependencies()` (dipanggil runtime), sementara route files tetap resolve di module scope — regresi yang tidak tertangkap tsc/lint/unit-test (tidak ada yang boot server).

**Fix (konsisten arsitektur):** semua route file diubah menjadi **factory function** (`createAuthRouter()` dst.) — `container.resolve` terjadi saat factory dipanggil, bukan saat import. `v1/index.ts` mengekspor `createV1Router()` yang memanggil semua factory; `registerRoutes.ts` memanggil `createV1Router()` saat runtime (setelah `registerDependencies()`). `health.routes.ts` tidak berubah (resolve di dalam handler, sudah aman).

**Verifikasi smoke test (DB & Redis ON):**
- `/health` → 200 `{status: ok}` ✅
- `/api/v1/health` → 200, postgres up (19ms), redis up (15ms) ✅
- `/api/v1/news/stream` tanpa token → 401 `UNAUTHENTICATED` (auth middleware jalan, bukan 500) ✅
- `/api/v1/auth/login` body invalid → 401 (bukan 500) ✅
- `npm test` → **7 files / 51 tests / 0 failed** (regresi 0) ✅ · tsc 0 · lint 0 ✅
- MT5 WS connected, calendar up-to-date, background jobs jalan ✅

---

## 8d. E2E API test — 3 bug nyata ditemukan & diperbaiki (2026-08-15)

Test endpoint menyeluruh (BE+FE ON, DB & Redis ON, user `test@betrix.test` + admin test `admintest@betrix.test` dibuat sementara di DB).

### 🐛 Bug yang ditemukan & diperbaiki

| # | Bug | Akar masalah | Fix |
|---|---|---|---|
| **B1** | `POST /admin/broadcast` selalu 400 VALIDATION_ERROR (subject Required, body jadi object) | `hasNestedShape()` di `validate.middleware.ts` mengecek `"body" in shape` — field FLAT bernama `body` (adminBroadcastDto) dianggap nested wrapper → schema di-parse terhadap `req` penuh | Cek nilai `shape.body/query/params` benar-benar ZodObject (punya `.shape`), bukan sekadar key; nested schema market tetap terdeteksi |
| **B2** | `GET /me/messages` selalu 500 `missing FROM-clause entry for table "u"` | `PgMessageRepository.findInbox/findSent`: SELECT selalu referensi `u.*` (from/to_email/name) tapi `LEFT JOIN users u` hanya ditambahkan saat `search` ada → tanpa search SQL invalid | JOIN users selalu ada (bukan kondisional) |
| **B3** | `GET /me/messages/preferences` → 500 uuid parse (`"preferences"` di-capture `:id`) | Route statis `preferences` didaftarkan SETELAH `/messages/:id` | Pindah route statis (preferences/sent) sebelum `/:id` |
| **B4** | `GET /market/prices/all` & `/mbook/all` → 404 (`"all"` di-capture `:symbol`) | Route `/:symbol` didaftarkan SEBELUM `/all` | Route statis `all` sebelum parameterized di market.routes.ts |

### ✅ Yang lolos test
- **Auth:** register (auto-login + token), login benar/salah (401), me, sessions (`{sessions}`), profile PUT, logout (token mati → 401), brute-force → **429 lockout** (authLimiter 10/5menit; login benar pun diblokir saat lockout aktif)
- **Market:** symbols (live dari MT5), ohlc single (candle nyata), calendar (data DB up-to-date), prices/all + mbook/all (200 pasca-fix; kosong karena cache belum terisi untuk symbol itu)
- **News:** list berita Finnhub ✓, **SSE stream live** (`price_update` ETHUSD/BTCUSD mengalir — MT5 WS connected)
- **Chat LLM:** `POST /chat` → reply `dahono/kimi-k3` (4136 input token), `POST /chat/stream` → SSE token streaming, history + export ✓ (chat tanpa `taskType` TIDAK tercatat history — DTO/perilaku: taskType wajib; FE kirim taskType)
- **User:** usage/me + current-month (summary), activity (login/chat_message), messages inbox/sent/detail/read, preferences GET/POST (pasca-fix B3), kirim pesan antar user (201)
- **Admin:** users (list+detail), metrics, system, analytics, logs, broadcast (200, 3 penerima, SMTP jalan), guard non-admin → 403 ✓

**Akun test sementara di DB:** `admintest@betrix.test` (is_admin=true) — HAPUS setelah test selesai. `test@betrix.test` sempat terkunci 429 ±5 menit akibat test brute-force (normal).

### 🔍 Verifikasi kontrak FE (2026-08-15)

- **Chat FE mengirim `taskType`** ✅ — `useChatStream.ts` mengirim `market_insight`/`trade_reasoning`/dll. TAPI default lama `"faq"` **tidak ada di enum backend** `ChatTaskType` → backend `resolveTier("faq")` jatuh ke fallback `balanced` (3 CRD) padahal FE estimasi `cheap` (1 CRD) → **estimasi kredit FE salah**.
- **Fix:** default `"faq"` → `"general"` di `useChatStream.ts` + key `faq` → `general` di `FRONTEND_TASK_TIER_MAP` (`analyzePageHelpers.tsx`) — cermin `TASK_TIER_MAP` backend (`general: cheap`), estimasi kredit kini akurat. Typecheck FE hijau.
- **Alur settings/device sessions** ✅ — `SettingsPage` panggil `getSessions(sessionToken)` → render `session.fingerprint` (16 char) + `formatDate(session.lastSeenAt)` + revoke; backend `GetSessionsUseCase` kirim `{ sessions: [{ fingerprint, createdAt, lastSeenAt, ip, userAgent, current }] }` — cocok (M1 fix).
- **Fix `current` di `GetSessionsUseCase` (2026-08-15):** `current` lama = `sessionTokens.has(device.fingerprint)` — membandingkan token vs fingerprint, tak pernah true. Kini `current = session.deviceFingerprint === device.fingerprint` (session yang di-resolve dari token request = device aktif); dead code `sessions`/`sessionTokens` dihapus. Catatan: dengan `DEVICE_ENFORCEMENT=false` session tak punya fingerprint & device tak di-bind → `sessions: []` wajar; perilaku `current` baru terlihat saat enforcement ON. tsc 0, test 51 ✅.

---

## 8e. Test lifecycle session di Redis — login → inspect → logout (2026-08-15)

Verifikasi end-to-end bahwa session benar-benar tersimpan & dihapus di Redis (Redis = Docker, diakses lewat Upstash REST client `@upstash/redis` → `http://localhost:8079`).

**Struktur key Redis (dari `RedisSessionRepository` + `RedisDeviceSessionRepository`):**
- `session:<sha256(token)>` → `userId` (TTL **86400s / 24 jam**, `setex`)
- `user_sessions:<userId>` → **set** berisi hash token (SADD + expire 24 jam)
- `device_session:<userId>:<fingerprint>` → token (hanya saat `DEVICE_ENFORCEMENT=true`)

**Hasil test (user `test@betrix.test`):**

| Langkah | Hasil |
|---|---|
| **Login** `POST /auth/login` | 200, `{ sessionToken, user }` (credits 90 — terpotong chat sebelumnya, normal) |
| **Redis setelah login** | `session:<hash>` → `"d61aa884-…"` (userId) ✅ · TTL **86400** ✅ · `user_sessions:<userId>` berisi hash token **true** ✅ · `device_session:*` = 0 (wajar, enforcement OFF) ✅ |
| **Logout** `POST /auth/logout` | 200 |
| **Redis setelah logout** | `session:<hash>` → **null (deleted)** ✅ · hash tidak lagi ada di `user_sessions:<userId>` (**false**) ✅ · total `session:*` turun 11 → 10 ✅ |
| **Token bekas** `GET /auth/me` | **401** ✅ (token invalid setelah logout) |

**Kesimpulan:** lifecycle session (create → simpan hash di set user → delete dari key + set) berfungsi penuh. Catatan: login awal ada 9–10 key `session:*` tersisa dari test sebelumnya (session aktif admin/chat) — bukan bocor, tapi session lama menumpuk di Redis sampai TTL 24 jam; `LogoutAllUseCase`/`deleteByUserId` tersedia untuk cleanup masif kalau perlu.

---

## 8f. Test environment menyeluruh (pre-audit) — 2026-08-15

Laporan lengkap: **`docs/env-test-report.md`**. Metode: instance test terpisah PORT=3100 dengan flag di-override (`DEVICE_ENFORCEMENT=true`, `AI_DEBUG_LOGGING=true`, `LOG_LEVEL=debug`) + observasi instance produksi 3000. DB & Redis Docker ON.

**Flag yang diuji hari ini (semua ✅, tidak ada bug pada flag):**
- `DEVICE_ENFORCEMENT=true`: login ke-2 dari device sama → **401 "Device already has active session"**; Redis `device_session:<userId>:<fp>` → token; `/auth/sessions` → **`current: true`** (validasi end-to-end fix `current` sesi lalu). false → sessions kosong.
- `AI_DEBUG_LOGGING=true` (+`LOG_LEVEL=debug`): `[AI_DEBUG] outgoing payload` + `[AI_DEBUG] gateway response` muncul di log.
- `RATE_LIMIT_REGISTER_PER_HOUR=5`: 5x register → 201, ke-6 → **429** + `[RateLimit] exceeded` (user test dibersihkan).
- `MT5_TRACK_MBOOK=false`: tidak di-subscribe (konsisten).

**Temuan pre-audit (detail di laporan):**
1. ⚠️ **Dua mekanisme fingerprint berbeda** — `DeviceFingerprint` (VO, base64 dari ip|ua mentah) dipakai AuthService vs `getDeviceFingerprint` (core utils, hex via UAParser) dipakai use-case lain → tidak akan cocok untuk request sama saat enforcement ON. Rekomendasi: unifikasi.
2. 🟡 `current: true` terbukti, tapi `ip`/`userAgent` di response sessions hardcode null (Device punya fieldnya).
3. 🟡 Env "hantu": `GENERAL_CACHE_TTL_DAYS` di .env tapi TIDAK di schema env; `SESSION_LOOKUP_TIMEOUT_MS` di schema tapi hardcode 5000 di repo.
4. 🟡 Google OAuth strategy terdaftar + callback URL benar (M2 fix terkonfirmasi `/api/v1/...`) — tapi alur penuh butuh browser (belum diuji).

**Cleanup:** instance 3100 di-kill, `device_session` test dihapus dari Redis, 5 user `rlimit*` dihapus dari DB, file temp dihapus. Server 3000 tidak disentuh.

---

## 8g. Unifikasi fingerprint device — satu sumber (2026-08-15)

Tindak lanjut temuan §8f.1: dua mekanisme fingerprint berbeda di-unifikasi.

**Sebelum (inkonsisten):**
- `DeviceFingerprint.create` (domain VO) = hash **base64** dari `ip | user-agent` mentah — dipakai `AuthService` (login) & `LogoutByCredentialsUseCase`.
- `getDeviceFingerprint` (core utils, UAParser) = hash **hex** dari `normalizeIP + browser + major version + OS + device.type` — dipakai `RegisterUseCase` (×3) & `LogoutUseCase`.
- → Fingerprint yang di-bind saat login/register TIDAK cocok dengan yang dicari saat logout/register-check → enforcement device tidak konsisten antar use-case.

**Sesudah (satu sumber):**
- `DeviceFingerprint.create` (domain VO) = satu-satunya sumber; logika UAParser + `normalizeIP` dipindah dari core ke VO (domain tetap pure; `ua-parser-js` adalah parser murni, tidak melanggar boundary `import/no-restricted-paths`). Hash **hex** dari `normalizeIP + browser + major version + OS + device.type` — lebih stabil daripada user-agent mentah (minor version/casing tidak mengubah fingerprint).
- `RegisterUseCase` & `LogoutUseCase` → `DeviceFingerprint.create(input.request).value`; `getDeviceFingerprint` + `src/core/utils/deviceFingerprint.ts` **dihapus** (barrel `core/utils/index.ts` diupdate).
- Test mocks (`LoginUseCase.test`, `RegisterUseCase.test`) drop `getDeviceFingerprint`.

**Verifikasi:** tsc 0 · lint 0/0 · boundary 0 · test **51/51** ✅. End-to-end (instance 3100, enforcement ON): login → `device_session` di Redis; logout dengan UA sama → **device_session TERHAPUS** (sebelumnya logout tak pernah match) ✅. Cleanup tuntas, server 3000 tidak disentuh.

---

## 8h. `/auth/sessions` kini mengembalikan ip & userAgent (2026-08-15)

Tindak lanjut temuan §8f.2: `ip`/`userAgent` di response sessions sebelumnya **hardcode null** di `GetSessionsUseCase`.

**Akar masalah:** tabel `sessions` (Postgres) punya kolom `ip`/`user_agent` tapi tidak dipakai — repo aktif `RedisSessionRepository` hanya menyimpan **userId** (`setex session:<hash>`), sehingga `findByToken`/`findByUserId` mengembalikan `ip/userAgent/deviceFingerprint = null`.

**Perubahan:**
1. `RedisSessionRepository.save()` kini menyimpan **metadata JSON v2** `{ v:2, userId, ip, userAgent, deviceFingerprint }` (bukan plain userId).
2. `reconstructSession()` (private) membaca format v2 **dengan fallback format lama** (plain userId) — session yang dibuat sebelum perubahan tidak invalid.
3. `GetSessionsUseCase`: `sessionRepo.findByUserId` (satu query) → map fingerprint → ip/userAgent; device aktif memakai metadata session request; device ter-bind memakai metadata session fingerprint-nya.

**Verifikasi:** tsc 0 · lint 0/0 · boundary 0 · test **51/51** ✅. End-to-end (instance 3100, enforcement ON): login → `/auth/sessions` menampilkan `ip: "::1"` + `userAgent` lengkap (sebelumnya null); raw Redis terkonfirmasi format v2. Cleanup tuntas, server 3000 tidak disentuh.

**Catatan:** device dari era sebelum unifikasi (fingerprint base64) tampil dengan `ip/userAgent: null` — wajar, metadata tidak pernah disimpan untuk session lama (akan terisi saat device itu login lagi).

---

## 8i. Normalisasi IP di session & request input (2026-08-15)

Tindak lanjut: `ip: "::1"` tampil di `/auth/sessions` padahal ada middleware `ipNormalizer` (::1 → 127.0.0.1, ::ffff:x → x).

**Akar masalah:** middleware `ipNormalizer` berjalan global (`startServer.ts:31`) dan menyimpan hasil di `req.normalizedIP`, tapi pembuat `RequestInput` memakai `req.ip` **mentah** — sehingga session/fingerprint/activity log menyimpan `::1`.

**Perbaikan (semua titik yang membangun request input):**
- `core/utils/request.ts`: `createRequestInput`/`createAuthenticatedRequestInput` → `resolveIP()` = `req.normalizedIP || req.ip || ""` (type `RequestLike` dengan `normalizedIP?`).
- `AuthController.getRequestInput` + `AdminController.getRequestInput`: `req.normalizedIP || req.ip || ""`.
- `AuthController` inline: `logoutByCredentials`, `logoutAll`, `googleCallback` (3 titik) → ternormalisasi.
- Bonus bug fix: `RedisSessionRepository.reconstructSession` — client Upstash meng-parse JSON otomatis, jadi nilai bisa **object** (bukan string); tipe `get<string | Record<string, unknown>>` + handling object (format v2) vs string (JSON string / plain userId lama). Tanpa ini `/auth/sessions` 500 `stored.startsWith is not a function`.

**Verifikasi:** tsc 0 · lint 0/0 · boundary 0 · test **51/51** ✅. End-to-end (instance 3100): login → raw Redis session `ip: "127.0.0.1"` (bukan ::1) ✅; `/auth/sessions` enforcement ON → device aktif `{ current: true, ip: "127.0.0.1" }` ✅; activity log login baru `127.0.0.1` ✅. Cleanup tuntas, server 3000 tidak disentuh.

---

## 8j. Regression E2E — 1 bug logout ditemukan & diperbaiki (2026-08-15)

Full test E2E ulang setelah rangkaian perubahan fingerprint/session/IP — **1 bug regresi nyata ditemukan**:

**Bug:** `POST /auth/logout` → **500** `invalid input syntax for type uuid: "{v:2,...}"` — `RedisSessionRepository.delete()` membaca nilai Redis (kini JSON v2) dan memperlakukan **seluruh nilai sebagai userId** → `user_sessions:<JSON>` + userId JSON dikirim ke query.

**Fix:** `extractUserId()` (private helper) — ekstrak `userId` dari nilai v2 (object / JSON string) atau format lama (plain string); `delete()` memakai helper itu (bukan nilai mentah); `reconstructSession` ikut menyederhanakan (pakai helper).

**Hasil E2E (BE:3000 tsx watch auto-reload, FE:5173, DB/Redis Docker ON):**
- **Auth:** login ✓ · me ✓ · sessions ✓ (ip `127.0.0.1` ternormalisasi di activity log; device lama `::1`/null = data sisa) · **logout → 200 + token 401** ✓ (pasca-fix) · register baru 201 ✓
- **Market:** symbols 200 · ohlc/BTCUSD/H1 (candle nyata) · ohlc/all 200 · calendar 200 · prices/all 200 ✓
- **News:** list 200 · SSE live (connected + price_update mengalir) ✓
- **Chat LLM:** send → reply benar · stream → SSE token mengalir · history 200 ✓
- **User:** messages inbox 200 · prefs GET 200 · usage/me + current-month 200 (data nyata) · activity 200 ✓
- **Admin:** guard non-admin 403 ✓ · users/metrics/system 200 (akun `admintest@betrix.test`) ✓
- **Kualitas:** tsc 0 · lint 0/0 · boundary 0 · test **51/51** ✓ (user `e2e-regress@betrix.test` dibersihkan)

**Catatan minor (bukan regresi):** activity `chat_message` tercatat `ip: unknown` (ChatController tidak kirim ip saat log chat — bisa dirapikan nanti); device `c8ec96d4...` (era pre-unifikasi) tampil `::1` sampai device itu login ulang.

---

## 8k. Bug report deep review — verifikasi & plan perbaikan (2026-08-16)

- **Sumber:** `docs/betrix-backend-bug-report.md` (deep review Claude: 11 bug bernomor + 4 catatan "not bugs").
- **Verifikasi manual ke kode:** **11/11 bug NYATA** — tidak ada false-positive. Detail per bug di plan.
- **Plan perbaikan:** `docs/bugfix-plan.md` (baru) — **5 phase** + **TODO list per bug** + template report per phase.
  - Phase 1 — Routing & Validasi: BUG-01 (route duplikat market), BUG-02 (`activeOnly` vs `active`)
  - Phase 2 — Rate limit & Session display: BUG-03 (`req.ip` mentah di key generator), BUG-05 (metadata device session pertama, bukan terbaru)
  - Phase 3 — Audit Log Admin: BUG-06 (kolom actor/target dibuang SQL→entity), BUG-07 (`UpdateUserUseCase` tak tercatat audit log)
  - Phase 4 — Operasional: BUG-08 (`cleanupOlderThan` 0 pemanggil; chat/activity tanpa method), BUG-11 (sync symbol di-skip pakai count)
  - Phase 5 — Auth Hardening: BUG-04 (lockout per (email,ip)), BUG-09 (TOCTOU bind device), BUG-10 (Google OAuth match tanpa cek verified)
- **Keputusan produk (arahan user, 2026-08-16):**
  - BUG-04 → layered policy: progressive delay per email (1–5 tanpa penalti, 6+ naik 1s/2s/4s... capped) + IP throttle tetap + CAPTCHA percobaan ke-5; **hapus hard lock 15 menit**.
  - BUG-10 → OAuth reclaim: akun existing `emailVerified=true` → auto-link; belum verified → set verified + **invalidasi password lama** → login.
  - Keputusan terbuka (konfirmasi saat eksekusi Phase 5): implementasi CAPTCHA (in-app vs Turnstile), perilaku login BUG-09 (blok vs izinkan tanpa update device), `requireEmailVerification` jadi wajib?
- **Status: PLAN DIBUAT — belum dieksekusi.** Baseline tetap: tsc 0 · lint 0/0 · boundary 0 · test 51/51.

---

## 8l. Bugfix Phase 1 selesai — BUG-01 & BUG-02 (2026-08-16)

Per plan `docs/bugfix-plan.md`: Phase 1 (Routing & Validasi) dieksekusi tuntas.

- **BUG-01** ✅ — `market.routes.ts`: hapus 3 registrasi route duplikat tanpa `validate()` (`/prices`, `/ohlc/all`, `/ohlc/:symbol/:timeframe`). Sebelumnya Express memakai registrasi pertama (tanpa validasi) → yang ber-validasi dead code. Kini tiap route **persis 1 registrasi** ber-validasi (`grep -c` = 1). Komentar `?symbols=`/`?timeframe=` dipindah ke registrasi yang masih hidup.
- **BUG-02** ✅ — `market.dto.ts`: rename field `activeOnly` → `active` di `getSymbolsDto`. Sebelumnya DTO memvalidasi nama yang tidak pernah dibaca controller (controller baca `req.query.active`) → validasi `?active=` tak pernah jalan. Controller tidak diubah.
- **Verifikasi:** tsc 0 · lint 0/0 · boundary 0 · test **7 files / 51 tests / 0 failed** (regresi 0).
- **Next:** Phase 2 (BUG-03 rateLimiter normalizedIP, BUG-05 metadata device terbaru) — tanpa keputusan produk, bisa langsung eksekusi.

---

## 8m. Bugfix Phase 2 selesai — BUG-03 & BUG-05 (2026-08-16)

Per plan `docs/bugfix-plan.md`: Phase 2 (Rate limit & Session display) dieksekusi tuntas.

- **BUG-03** ✅ — `rateLimiter.ts`: `createIpKeyGenerator()` kini `req.normalizedIP || req.ip || "unknown"` (sebelumnya `req.ip` mentah → klien dual-stack/proxy bisa masuk 2 bucket berbeda). Bonus konsistensi: fallback `perUserLimiter` & `sensitiveLimiter` (unauthenticated) ikut pakai `normalizedIP`.
- **BUG-05** ✅ — `GetSessionsUseCase`: `sessionMetaByFingerprint` pilih session dengan `createdAt` terbaru per fingerprint (sebelumnya first-seen — urutan `SMEMBERS` Redis tak dijamin, metadata device bisa tampil acak kalau device punya >1 session aktif). Kosmetik display saja, tanpa dampak keamanan.
- **Verifikasi:** tsc 0 · lint 0/0 · boundary 0 · test **7 files / 51 tests / 0 failed**.
- **Next:** Phase 3 (BUG-06 audit log kolom actor/target, BUG-07 `UpdateUserUseCase` tercatat) — prioritas compliance, tanpa keputusan produk.

---

## 8n. Bugfix Phase 3 selesai — BUG-06 & BUG-07 (2026-08-16)

Per plan `docs/bugfix-plan.md`: Phase 3 (Audit Log Admin) dieksekusi tuntas — prioritas compliance (dua-duanya Medium–High).

- **BUG-06** ✅ — Audit log kini menampilkan data nyata. Sebelumnya: SQL `findAll` sudah menghitung `actor_type/actor_email/actor_name/target_email/target_name` via JOIN users, tapi `mapRow()` membuangnya (entity tak punya field), dan kedua use case hardcode blank (`targetEmail: null`, `admin: {email:""}`) + `actorType: a.action.startsWith("user_") ? "user" : "admin"` (tak pernah true). Perubahan: 5 field optional di `AdminAction` entity, `mapRow` meneruskannya, `GetAuditLogsUseCase` & `ExportAuditLogsUseCase` pakai nilai entity (`a.actorType ?? "admin"` sebagai fallback type-safe yang tak pernah terpakai dari `findAll`).
- **BUG-07** ✅ — `UpdateUserUseCase` (ban/suspend/reactivate + grant/revoke admin) kini inject `ActivityLogRepository` dan mencatat `update_user` dengan details (`statusChanged`/`isAdminChanged`/`newStatus`/`newIsAdmin`). Sebelumnya aksi paling sensitif ini **nol trace** — `AdminActionType.UPDATE_USER` hanya ada di enum, 0 pemakaian. `DeleteUserUseCase`/`ResetUserPassword`/`Broadcast` sudah log.
- **Verifikasi:** tsc 0 · lint 0/0 · boundary 0 · test **7 files / 51 tests / 0 failed**.
- **Next:** Phase 4 (BUG-08 `cleanupOlderThan` di-wire ke `SystemCleanupUseCase` + method baru chat/activity; BUG-11 sync symbol tanpa count-gate) — butuh konfirmasi retention period.

---

## 8o. Bugfix Phase 4 selesai — BUG-08 & BUG-11 (2026-08-16)

Per plan `docs/bugfix-plan.md`: Phase 4 (Operasional & Scaling) dieksekusi tuntas. Retention yang dipakai: token_usage 90, failed_login_attempts 30, chat_logs 90, user_activity_logs 90 hari — **calendar_events & admin_actions sengaja TIDAK di-delete**.

- **BUG-08** ✅ — `cleanupOlderThan` yang tadinya dead code kini ter-wire: `SystemCleanupUseCase` inject `UsageRepository`/`LoginAttemptRepository`/`ChatRepository`/`ActivityLogRepository` + tambah ke `Promise.allSettled`. `ChatRepository` & `ActivityLogRepository` (interface + Pg impl) dapat method `cleanupOlderThan` baru — activity cleanup hanya `user_activity_logs` (admin_actions di-exclude untuk audit trail compliance). Semua jalan via `HourlyCleanupJob` yang sudah ada. Sebelumnya `token_usage` & `chat_logs` (data paling cepat tumbuh, ±1 baris per pesan chat) tidak pernah dipangkas.
- **BUG-11** ✅ — `SymbolService.syncBrokerSymbols`: hapus gate `count === storedCount → skip`. Sebelumnya rename/ubah `trade_mode`/`description`/`category` dengan total count sama → `broker_symbols` stale selamanya (memperparah M4). Kini selalu fetch + `saveMany` (idempotent via `ON CONFLICT DO UPDATE`); count hanya jadi log.
- **Verifikasi:** tsc 0 · lint 0/0 · boundary 0 · test **7 files / 51 tests / 0 failed**. Container tidak perlu registrasi baru (token DI sudah ada).
- **Next:** Phase 5 (BUG-04, 09, 10) — butuh konfirmasi 3 keputusan terbuka: implementasi CAPTCHA, perilaku login BUG-09 saat device milik akun lain, `requireEmailVerification` wajib?.

---

## 8p. Bugfix Phase 5 selesai — BUG-04, BUG-09, BUG-10 (2026-08-16) — SEMUA 11 BUG SELESAI

Per plan `docs/bugfix-plan.md`: Phase 5 (Auth Hardening) dieksekusi tuntas — **11/11 bug diperbaiki**. Keputusan user: CAPTCHA opsi (a) in-app, BUG-09 blok login, `requireEmailVerification` tetap toggle .env.

- **BUG-04** ✅ — **Layered lockout, hard lock 15 menit dihapus.** Baru: `domain/services/loginPolicy.ts` (pure — `computeLoginDelaySeconds` 1s/2s/4s…cap 30s mulai kegagalan ke-6; `isCaptchaRequired` ≥5; window 15 menit), `CaptchaStore` (port) + `RedisCaptchaStore` (data, TTL 5 menit) + `CaptchaService` (application — challenge matematika in-app `"Berapa X + Y?"`, jawaban sha256, sekali pakai), `CaptchaRequiredError` (428, challenge di `details` — FE menampilkannya langsung dari response, tanpa endpoint terpisah). `LoginAttemptRepository.isAccountLocked` → `countRecentFailures(email, window)` (SEMUA IP — rotasi IP tak bisa lolos). `LoginUseCase`: captcha gate (salah → record + challenge baru; tidak dikirim → tidak dihitung kegagalan) → progressive delay → verifikasi. `loginDto` + `AuthController.login`: field `captcha { challengeId, answer }`.
- **BUG-09** ✅ — `PgDeviceRepository.bind`: `ON CONFLICT DO UPDATE SET last_seen_at` + `WHERE user_devices.user_id = EXCLUDED.user_id` — user_id **tidak pernah reassign** (sebelumnya bisa merampas device antar akun senyap); konflik antar akun → return null. `RegisterUseCase`: bind null → rollback user baru + `ConflictError`. `AuthService`: bind SEBELUM session dibuat → null = **blok login** 403 (keputusan user).
- **BUG-10** ✅ — `passport.ts` Google strategy: akun existing `emailVerified=true` → auto-link; `!emailVerified` → **reclaim**: `withEmailVerified()` + `withPasswordHash(null)` (method baru di `User`) → save → login — email-squatting (pre-registrasi unverified) tidak lagi membajak login Google.
- **Test:** bertambah `loginPolicy.test.ts` (6) → **8 files / 57 tests / 0 failed**; `LoginUseCase.test` & `RegisterUseCase.test` diupdate ke flow baru.
- **Verifikasi final:** tsc 0 · lint 0/0 · boundary 0 · test 8 files / 57 tests ✅.
- **Catatan follow-up (opsional):** `googleId` tidak di-set saat reclaim; E2E live (brute-force, 2 device, browser Google) belum dijalankan.

## 8q. Konsistensi bahasa — semua pesan user-facing jadi Bahasa Inggris (2026-08-16)

Permintaan user: pesan yang tampil di backend jangan campur aduk — **konsisten semua Inggris**. Audit string user-facing di `Backend/src` menemukan 11 string Indonesia → semuanya diubah:

- **`AuthController.ts`** — `"Logout berhasil"` (×2) → `"Logout successful"`; `` `Logout dari ${count} device berhasil` `` → `` `Logged out from ${count} devices successfully` ``.
- **`NewsController.ts`** — `` `asset tidak dikenal, pilih salah satu: ...` `` → `` `Asset not recognized, pick one of: ...` ``.
- **`CaptchaService.ts`** — challenge CAPTCHA `` `Berapa X + Y?` `` → `` `What is X + Y?` `` (perlu update FE saat wiring).
- **`LoginUseCase.ts`** — `"CAPTCHA salah atau kedaluwarsa"` → `"Incorrect or expired CAPTCHA"`.
- **`rateLimiter.ts`** — 5 pesan 429 `"Terlalu banyak ..."` → `"Too many ..."` (perlu update FE jika menampilkan pesan ini).
- **Test:** `LoginUseCase.test.ts` mock question + assert disinkronkan ke English.

**Catatan scope:** yang diubah hanya **pesan user-facing (response error/message)**. Komentar kode berbahasa Indonesia sengaja dibiarkan (bukan output). Frontend (Vite/Next/Admin) masih punya string UI Indonesia sendiri — di luar scope task ini.

**Verifikasi:** tsc 0 · lint 0/0 · boundary 0 · test **8 files / 57 tests / 0 failed** ✅. `grep` final: 0 match string Indonesia user-facing tersisa di `src/`.

## 8r. Follow-up Phase 5 — googleId reclaim + E2E live (2026-08-16)

**Follow-up #1 — `googleId` saat reclaim OAuth (BUG-10):** sebelumnya `passport.ts` reclaim hanya `withEmailVerified().withPasswordHash(null)` — `googleId` tidak di-set (tercatat di §8p). Sekarang: method baru `User.withGoogleId()` (pola immutability) + rantai reclaim `.withEmailVerified().withPasswordHash(null).withGoogleId(profile.id)`. Test baru `src/domain/entities/User.test.ts` (5 test) → **9 files / 62 tests / 0 failed**.

**Follow-up #2 — E2E live** (infra docker lokal: Postgres :5432, Redis :6379; server `tsx src/main.ts` di port 3000, dimatikan setelah selesai):

- **BUG-04 (layered lockout + CAPTCHA) — terverifikasi live ✅**: register → 201; login salah ×5 → 401; login ke-6 tanpa captcha → **428** `Human verification required` + `details.challenge` (`What is X + Y?` — Inggris, konsisten §8q); captcha salah → **428** `Incorrect or expired CAPTCHA` + challenge baru (kegagalan naik → captcha tetap wajib, sesuai policy); captcha benar → **200 + sessionToken**; `/me` → 200; logout → 200 `Logout successful`.
- **BUG-09 (device bind) — terverifikasi live ✅**: register dari device yang sudah ter-bind ke akun lain → **409** `This device is already registered to another account` (rollback + ConflictError bekerja); login dari device milik akun lain → **403 FORBIDDEN** `Device is bound to another account`.
- **BUG-10 (OAuth) — TIDAK bisa E2E penuh**: butuh browser Google interaktif + akun Google sungguhan (flow OAuth tidak bisa di-drive via curl). Path reclaim dijamin oleh unit test (`User.test.ts`); fix `googleId` sudah masuk.

**Temuan & perbaikan dari E2E:**
1. **Status blok device tadinya 401, bukan 403** — `AuthService` return `{ status: 403 }` tapi `LoginUseCase` membuang status & melempar `AuthenticationError` (401). Diperbaiki: `AuthorizationError` (403 FORBIDDEN) + konstruktor menerima `details` opsional (sama pola `AuthenticationError`) → `LoginUseCase` lempar `AuthorizationError` dengan `{ hasActiveSession }`. Verifikasi live ulang: **403 FORBIDDEN** ✅.
2. **Fingerprint device bisa collide untuk UA custom** — `DeviceFingerprint.create` = hash(IP | browser | major version | OS | device.type via UAParser). UA custom yang tidak dikenali UAParser → fallback `"unknown"` → 2 UA berbeda bisa hash sama (terjadi saat E2E). By design (stabilitas > granularitas), layak diingat saat debugging device.

**Verifikasi:** tsc 0 · lint 0/0 · boundary 0 · test **9 files / 62 tests / 0 failed**. Cleanup data test: 5 user `e2e-*@betrix.test` + 8 failed-login + 3 device + 4 activity log dihapus dari Postgres; key Redis (`session:*`, `user_sessions:*`) dari user test akan expire otomatis (TTL 24 jam).

## 8s. Test drive `npm run dev` — semua Bug 1–11 live (2026-08-16)

Permintaan user: jalankan `npm run dev` (tsx watch, port 3000) + test drive Bug 1–11. Server dijalankan dengan `DEVICE_ENFORCEMENT=true` (inline, tanpa ubah .env) agar BUG-09 bisa diuji; data test `e2e-*@betrix.test` dibersihkan setelahnya.

| Bug | Verifikasi live | Hasil |
|---|---|---|
| BUG-01 | `/market/prices` & `/ohlc/all` tanpa query wajib | **400** Validation failed (validasi kini hidup; `?symbols=XAUUSD` → 200) ✅ |
| BUG-02 | `/market/symbols?active=false` memfilter; `?active=abc` → coerce true (perilaku Zod standar) | mapping nama `active` bekerja ✅ |
| BUG-03 | `PUT /auth/password` ×4 (sensitiveLimiter per-user) | ke-4 → **429** limiter aktif ✅ |
| BUG-04 | register → 5× salah (401) → 428 + challenge → captcha benar | **200** recovery penuh ✅ |
| BUG-05 | `GET /auth/sessions` | `ip: "127.0.0.1"` + `userAgent` tampil ✅ |
| BUG-06 | `GET /admin/actions` + `/actions/export` | actor/target email+name terisi di JSON & CSV ✅ |
| BUG-07 | `PUT /admin/users/:id {status:suspended}` | 200 + entry `update_user` tercatat ✅ |
| BUG-08 | log server `[Cleanup] System cleanup completed` | kini menyertakan `failed login attempts`, `chat logs`, `user activity logs` ✅ |
| BUG-09 | register device milik akun lain → 409; login device milik akun lain → 403 | **409** conflict + **403 FORBIDDEN** `Device is bound to another account` ✅ |
| BUG-10 | Google OAuth | ⚠️ tidak bisa live (butuh browser + akun Google interaktif) — dijamin unit test |
| BUG-11 | log server `[Symbols] Synced ...` | `Synced 8562 broker symbols` (tanpa count-gate) ✅ |

**Catatan test-drive:** (1) fingerprint device = hash(IP+browser+OS+device via UAParser) — UA Chrome Windows kita collide dengan device `test@betrix.test` (akun test lama), jadi register 409; pakai UA berbeda untuk tiap akun. (2) Dengan enforcement ON, login kedua dari device yang sama → 403 `Device already has active session` (single-session per device by design). (3) Cleanup: 5 user e2e + 4 device + 4 activity + 1 admin_action dihapus; server dimatikan.

## 8t. Symbol sync throttle (Opsi B) — hentikan fetch symbol/list tiap restart (2026-08-16)

**Latar:** MT5 log mencatat `GET /v1/symbol/list` setiap kali backend restart. Penyebab: fix BUG-11 menghapus count-gate (count tidak mendeteksi rename/trade_mode change dengan total sama), jadi `SymbolService.syncBrokerSymbols` selalu fetch + upsert, dan `background/jobs/index.ts` memanggilnya tiap boot. `GET /v1/symbol/count` masih ada di `Mt5HttpClient.fetchSymbolCount()` tapi tak terpakai.

**Keputusan user: Opsi B (throttle waktu)** + DailySyncJob memakai `MT5_BROKER_UTC_OFFSET=3` (ternyata **sudah** — `secondsUntilBrokerMidnight(env.MT5_BROKER_UTC_OFFSET)` + 5 menit).

**Implementasi:**
- `SymbolRepository` + `PgSymbolRepository`: method `getLastSyncedAt()` / `setLastSyncedAt()` — key `last_synced_at` di tabel `symbol_sync_metadata` (bersanding `stored_count`).
- `SymbolService.syncBrokerSymbols({ force? })`: throttle **12 jam** — kalau `last_synced_at` masih fresh → log `Skipping symbol sync — last synced X min ago` dan return (tanpa fetch). `force: true` bypass throttle.
- `background/jobs/index.ts` (boot): panggil tanpa force → throttle aktif. `DailySyncJob`: `{ force: true }` → full refresh harian selalu jalan (menutup celah BUG-11 tetap terjaga).
- Unit test baru `SymbolService.test.ts` (5 test: skip fresh, force bypass, null, stale ≥12h, empty list) → **10 files / 67 tests / 0 failed**.

**Verifikasi live (2 skenario):** (1) `last_synced_at` fresh → restart → `Skipping symbol sync — last synced 0 min ago (throttle 12h)` — **tidak ada** `GET /v1/symbol/list` di MT5 ✅. (2) key `last_synced_at` dihapus → restart → `Synced 8562 broker symbols` + key terisi ulang ✅. Server dimatikan setelah test (kill tree — child `tsx watch` harus ikut mati, kalau tidak port 3000 EADDRINUSE).

---

## 9. Inventaris file yang sering disentuh

- `eslint.config.js` — guardrail boundary (domain + konteks).
- `tsconfig.json` — alias `@contexts/*` (tambah Phase 7).
- `src/bootstrap/container.ts` — semua registrasi token DI + AppSettings/ModelPolicy (env dibaca di sini).
- `src/core/settings/AppSettings.ts` — settings ter-inject.
- `src/domain/services/ModelPolicy.ts` — policy model murni.
- `src/application/mappers/user.mapper.ts` — mapper DTO user.
- `src/contexts/news/**` — konteks news (template bounded context).
- `docs/ddd-refactor-plan.md` — plan + report semua fase (sumber kebenaran angka & keputusan).
- `docs/bugfix-plan.md` — plan perbaikan 11 bug (5 phase + TODO list per bug + report per phase).
- `docs/betrix-backend-bug-report.md` — sumber bug report (deep review, tidak diedit).
- `docs/session-context.md` — file ini.

---

## 10. Struktur direktori terkini (ringkas)

```
src/
├── domain/            # shared kernel domain: entities, repositories (iface), ports, services (pure), value-objects, events
├── contexts/news/     # bounded context pertama: domain/ application/ infrastructure/ (+ NewsContextPort)
├── application/       # use-cases (auth/admin/chat/market/user), services (Calendar/Market/Symbol/AuthService), mappers, dtos, event-handlers
├── data/              # repositories (Pg*/Redis*), external (Mt5*, AiGateway, EmailService, FinnhubClient), orm, cache
├── presentation/      # controllers (constructor DI), routes/v1, middleware
├── infrastructure/    # sse (SseNotifier)
├── core/              # errors, logging, settings, utils
├── background/jobs/   # Mt5SubscriptionJob, DailySyncJob, HourlyCleanupJob, NewsPollingJob
├── config/            # env (zod), passport, deviceEnforcement
├── bootstrap/         # container, registerRoutes, registerMiddleware, events
└── main.ts
```
