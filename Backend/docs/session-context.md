# Session Context — Betrix Backend (DDD Refactor)

> **Fungsi dokumen ini:** snapshot lengkap konteks percakapan AI coding dari awal sampai sekarang.
> Dibuat: 2026-08-15. Dipakai untuk **resume percakapan** tanpa kehilangan konteks.
>
> **Cara resume:** baca file ini dulu (state, keputusan, gotcha), lalu `docs/ddd-refactor-plan.md`
> (plan + report per fase dengan angka verifikasi). Kalau lanjut kerja: mulai dari **Phase 8** (belum dieksekusi).

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

## 9. Inventaris file yang sering disentuh

- `eslint.config.js` — guardrail boundary (domain + konteks).
- `tsconfig.json` — alias `@contexts/*` (tambah Phase 7).
- `src/bootstrap/container.ts` — semua registrasi token DI + AppSettings/ModelPolicy (env dibaca di sini).
- `src/core/settings/AppSettings.ts` — settings ter-inject.
- `src/domain/services/ModelPolicy.ts` — policy model murni.
- `src/application/mappers/user.mapper.ts` — mapper DTO user.
- `src/contexts/news/**` — konteks news (template bounded context).
- `docs/ddd-refactor-plan.md` — plan + report semua fase (sumber kebenaran angka & keputusan).
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
