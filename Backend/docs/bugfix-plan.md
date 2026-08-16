# Plan Perbaikan Bug — Betrix Backend (post-DDD-refactor)

> Dokumen kerja: pembagian **11 bug** (dari deep review — sumber: `docs/betrix-backend-bug-report.md`)
> menjadi **5 phase**, lengkap dengan **TODO list per bug** dan template report per phase.
>
> Status: ✅ **SEMUA PHASE SELESAI (1–5)** — 11/11 bug diperbaiki. (2026-08-16)
> Verifikasi klaim bug: **11/11 NYATA** — semua sudah dicek langsung ke kode (detail: `docs/session-context.md` §8k).
>
> **Cara pakai:** kerjakan bug berurutan per phase → isi bagian **Report** tiap bug → update matriks status →
> update `docs/session-context.md` (tambah section baru, pola §8b–8j) → jalankan verifikasi wajib sebelum lanjut.

---

## 1. Ringkasan Eksekutif

**Sumber bug:** deep review AI (Claude) atas `src/` pasca refactor DDD. `tsc`/`lint`/`test` semua hijau
(0/0/51-51) — 11 bug ini **logic/behavior bug**, tidak tertangkap type checker maupun unit test yang ada.

**Hasil verifikasi manual ke kode (2026-08-16):** **11/11 terkonfirmasi benar.** Tidak ada false-positive.
4 di antaranya butuh **keputusan produk** sebelum eksekusi (BUG-04, BUG-09 [sebagian], BUG-10, plus keputusan
retention di BUG-08). Arahan untuk BUG-04 & BUG-10 sudah diberikan user (lihat §4).

**Pembagian phase (urutan aman: risiko rendah → tinggi, yang butuh keputusan di akhir):**

| Phase | Fokus | Bug | Butuh keputusan | Status |
|---|---|---|---|---|
| **1** | Routing & Validasi | BUG-01, BUG-02 | — | ✅ |
| **2** | Rate limit & Session display | BUG-03, BUG-05 | — | ✅ |
| **3** | Audit Log Admin (compliance) | BUG-06, BUG-07 | — | ✅ |
| **4** | Operasional & Scaling (preventive) | BUG-08, BUG-11 | retention period | ✅ |
| **5** | Auth Hardening | BUG-04, BUG-09, BUG-10 | ya (policy) | ✅ |

**Verifikasi wajib tiap phase (sama seperti refactor DDD):**
```bash
npx tsc --noEmit 2>&1 | tail -5; echo "tsc-exit:${PIPESTATUS[0]}"
npm run lint 2>&1 | tail -3
npm test 2>&1 | tail -10
```
Target akhir tiap phase: **tsc 0 · lint 0/0 · boundary 0 · test 51/51** (regresi 0).

---

## 2. Matriks Bug per Phase

| # | Severity | File utama | Inti masalah | Phase | Status |
|---|---|---|---|---|---|
| BUG-01 | Medium | `market.routes.ts` | 3 route terdaftar 2×; yang ber-validasi dead code | 1 | ✅ |
| BUG-02 | Low | `market.dto.ts` | DTO validasi `activeOnly`, controller baca `active` | 1 | ✅ |
| BUG-03 | Low–Med | `rateLimiter.ts` | Key generator pakai `req.ip` mentah (bukan `normalizedIP`) | 2 | ✅ |
| BUG-05 | Low | `GetSessionsUseCase.ts` | Metadata device = session pertama (acak), bukan terbaru | 2 | ✅ |
| BUG-06 | Med–High | `AdminAction` + repo + 2 use case | Kolom actor/target dihitung SQL tapi dibuang | 3 | ✅ |
| BUG-07 | Med–High | `UpdateUserUseCase.ts` | Ban/suspend/grant-admin TIDAK tercatat audit log | 3 | ✅ |
| BUG-08 | Medium | `SystemCleanupUseCase.ts` + 2 repo | `cleanupOlderThan` ada tapi tak dipanggil; chat/activity tak punya method | 4 | ✅ |
| BUG-11 | Medium | `SymbolService.ts` | Sync di-skip kalau total count sama (stale selamanya) | 4 | ✅ |
| BUG-04 | Medium | `PgLoginAttemptRepository.ts` | Lockout per (email,ip) — bisa di-bypass rotasi IP | 5 | ✅ |
| BUG-09 | Medium | `PgDeviceRepository.ts` (`bind`) | TOCTOU: bind bisa merampas device antar akun | 5 | ✅ |
| BUG-10 | Med–High | `passport.ts` + `AuthController.ts` | Google login auto-match email tanpa cek verified → email-squatting | 5 | ✅ |

---

## Phase 1 — Routing & Validasi (BUG-01, BUG-02)

**Tujuan:** pastikan validasi query/param market benar-benar jalan; hilangkan dead code route.

### BUG-01 — Duplicate route registration (3 endpoint)
**File:** `src/presentation/routes/v1/market.routes.ts`

Fakta di kode: `/prices`, `/ohlc/all`, `/ohlc/:symbol/:timeframe` masing-masing di-register 2× — yang pertama
(tanpa `validate()`) menang karena Express pakai registrasi pertama. Yang ber-validasi (bawah file) dead code.

**TODO list:**
- [ ] Hapus registrasi PERTAMA (tanpa validate) untuk `/prices` (baris `router.get("/prices", controller.getPrices...)`)
- [ ] Hapus registrasi PERTAMA untuk `/ohlc/all` (`controller.getAllOHLC`)
- [ ] Hapus registrasi PERTAMA untuk `/ohlc/:symbol/:timeframe` (`controller.getOHLC`)
- [ ] Pastikan setiap route muncul **persis 1×** (versi ber-`validate(...)` tetap di posisi bawah)
- [ ] Verifikasi: `grep -c 'router.get("/prices"' src/presentation/routes/v1/market.routes.ts` → `1` (sama untuk `/ohlc/all`, `/ohlc/:symbol/:timeframe`)
- [ ] Verifikasi wajib: tsc 0 · lint 0/0 · boundary 0 · test 51/51

**Definition of Done:** tiap route tersebut tepat 1 registrasi (yang ber-validasi); suite hijau.

### BUG-02 — `activeOnly` vs `active`
**Files:** `src/application/dtos/market.dto.ts`, `src/presentation/controllers/MarketController.ts` (`getSymbols`)

Fakta di kode: DTO validasi `activeOnly`; controller baca `req.query.active` — nama beda → validasi tak pernah
menyentuh param yang benar-benar dipakai. `active` adalah nama yang ter-wire ke perilaku (dan dipakai FE).

**TODO list:**
- [ ] Di `getSymbolsDto` (market.dto.ts): rename field `activeOnly` → `active` (nilai & default tetap `z.coerce.boolean().default(true)`)
- [ ] Jangan ubah controller (tetap baca `req.query.active`)
- [ ] Verifikasi: `GET /market/symbols?active=false` kini melewati validasi schema
- [ ] Verifikasi wajib: tsc 0 (cek tipe `GetSymbolsDto` berubah) · lint 0/0 · test 51/51

**Definition of Done:** nama field DTO = nama yang dibaca controller; validasi aktif untuk `active`.

### Report — Phase 1 ✅ SELESAI (2026-08-16)

| Bidang | Isi |
|---|---|
| **Eksekusi** | BUG-01 — hapus 3 registrasi route duplikat tanpa `validate()` di `market.routes.ts` (`/prices`, `/ohlc/all`, `/ohlc/:symbol/:timeframe`); komentar `// ?symbols=` & `// ?timeframe=` dipindah ke registrasi ber-validasi agar tetap informatif. BUG-02 — rename field `activeOnly` → `active` di `getSymbolsDto` (`market.dto.ts`); controller tidak diubah (tetap baca `req.query.active`). |
| **Verifikasi** | `grep -c` tiap route → `1` (persis 1 registrasi ber-validasi). `npx tsc --noEmit` → 0 error. `npm run lint` → 0 error, 0 warning. Boundary `import/no-restricted-paths` → 0. `npm test` → **7 files / 51 tests / 0 failed** (regresi 0). |
| **Temuan** | Tidak ada temuan tak terduga — fix literal sesuai report. Komentar query (symbols/timeframe) dipindah ke registrasi yang masih hidup supaya tidak hilang. Validasi kini benar-benar jalan untuk 3 endpoint market. |
| **DoD** | ✅ tercapai — tiap route tersebut tepat 1 registrasi (yang ber-validasi); suite hijau. |

---

## Phase 2 — Rate limit & Session display (BUG-03, BUG-05)

**Tujuan:** konsistensi normalisasi IP di rate limiter; tampilkan metadata device terbaru di `/auth/sessions`.

### BUG-03 — Rate limiter key pakai `req.ip` mentah
**File:** `src/core/middleware/rateLimiter.ts`

Fakta di kode: `createIpKeyGenerator()` → `ipKeyGenerator(req.ip || "unknown")`. Padahal seluruh codebase
(§8i session-context) normalisasi IP via `req.normalizedIP`; handler limiter sendiri pun sudah pakai
`req.normalizedIP || req.ip`. Klien dual-stack/proxy bisa masuk 2 bucket berbeda.

**TODO list:**
- [ ] `createIpKeyGenerator()`: ganti ke `ipKeyGenerator(req.normalizedIP || req.ip || "unknown")`
- [ ] Konsistensi (bonus): fallback di `perUserLimiter` & `sensitiveLimiter` (`req.ip || "unknown"`) → `req.normalizedIP || req.ip || "unknown"`
- [ ] Verifikasi wajib: tsc 0 · lint 0/0 · test 51/51 (tidak ada perubahan perilaku untuk klien normal)

**Definition of Done:** semua key generator IP memakai `normalizedIP` dulu.

### BUG-05 — Metadata device pakai session pertama, bukan terbaru
**File:** `src/application/use-cases/auth/GetSessionsUseCase.ts`

Fakta di kode: `sessionMetaByFingerprint` diisi hanya kalau belum ada (`!has(...)`) — session **pertama** dari
`findByUserId` (SMEMBERS Redis, urutan tak dijamin) yang menang. Device dengan >1 session aktif bisa menampilkan
IP/UA yang bukan terbaru. **Hanya kosmetik** (display), tanpa dampak keamanan.

**TODO list:**
- [ ] Ganti loop: `if (!s.deviceFingerprint) continue;` → overwrite kalau `s.createdAt > existing.createdAt`
- [ ] Ubah tipe `Map<string, { ip; userAgent; createdAt }>` (tambah `createdAt`)
- [ ] Saat baca `meta?.ip`/`meta?.userAgent` di bawah: tetap sama (drop `createdAt` tidak perlu di-output)
- [ ] Verifikasi wajib: tsc 0 · lint 0/0 · test 51/51
- [ ] (Opsional) E2E: 2 session device sama dengan IP beda → tampil metadata yang terbaru

**Definition of Done:** per fingerprint, metadata berasal dari session dengan `createdAt` terbaru.

### Report — Phase 2 ✅ SELESAI (2026-08-16)

| Bidang | Isi |
|---|---|
| **Eksekusi** | BUG-03 — `createIpKeyGenerator()` di `rateLimiter.ts` → `req.normalizedIP || req.ip || "unknown"` (konsisten dengan handler & controller). Bonus konsistensi: fallback `perUserLimiter` & `sensitiveLimiter` (saat request unauthenticated) ikut pakai `normalizedIP`. BUG-05 — `GetSessionsUseCase.sessionMetaByFingerprint`: pilih session dengan `createdAt` **terbaru** per fingerprint (overwrite, bukan first-seen); tipe Map value ditambah `createdAt`. |
| **Verifikasi** | `npx tsc --noEmit` → 0 error. `npm run lint` → 0 error, 0 warning. Boundary → 0. `npm test` → **7 files / 51 tests / 0 failed**. |
| **Temuan** | 1) `req.normalizedIP` sudah bertipe (augmentasi global `Request` di `requestId.ts` — dipakai handler limiter sejak lama), tidak perlu perubahan tipe. 2) E2E BUG-05 (2 session device sama, IP beda) tidak dijalankan — butuh Redis live; perubahan murni logika pilih-terbaru, aman. 3) Tidak ada perubahan perilaku untuk klien normal (single-representation IP). |
| **DoD** | ✅ tercapai — semua key generator IP pakai `normalizedIP` dulu; per fingerprint metadata berasal dari session `createdAt` terbaru; suite hijau. |

---

## Phase 3 — Audit Log Admin (BUG-06, BUG-07)

**Tujuan:** audit log admin akurat (aktor & target terisi) dan aksi paling sensitif tercatat. **Prioritas tertinggi**
— dua-duanya Medium–High (compliance/security).

### BUG-06 — Kolom actor/target dibuang di pipeline audit log
**Files:** `src/domain/entities/AdminAction.ts`, `src/data/repositories/PgAdminActionRepository.ts`,
`src/application/use-cases/admin/GetAuditLogsUseCase.ts`, `src/application/use-cases/admin/ExportAuditLogsUseCase.ts`

Fakta di kode: SQL `findAll` sudah JOIN users 2× dan menghitung `actor_type/actor_email/actor_name/target_email/
target_name` dengan benar, tapi `mapRow()` membuang kelima kolom (entity tidak punya field), lalu kedua use case
hardcode `actorType: a.action.startsWith("user_") ? "user" : "admin"` (tak pernah true — tidak ada action berawalan
"user_"), `targetEmail: null`, `targetName: null`, `admin: { email: "", name: null }`.

**TODO list:**
- [ ] `AdminAction.ts`: tambah 5 field **optional** di constructor + `create()`: `actorType?: "admin" | "user"`, `actorEmail?: string | null`, `actorName?: string | null`, `targetEmail?: string | null`, `targetName?: string | null` (default `undefined`/`null` agar `AdminAction.create()` untuk SAVE tetap jalan tanpa perubahan)
- [ ] `PgAdminActionRepository.ts`: `AdminActionRow` tambah `actor_type: string`, `actor_email/actor_name/target_email/target_name: string | null`; `mapRow()` pass kelima nilai ke entity
- [ ] `GetAuditLogsUseCase.ts`: ganti hardcode → `actorType: a.actorType`, `targetEmail: a.targetEmail`, `targetName: a.targetName`, `admin: { email: a.actorEmail ?? "", name: a.actorName ?? null }`
- [ ] `ExportAuditLogsUseCase.ts`: sama (dua use case identik — jangan lupa keduanya)
- [ ] Verifikasi: tsc 0 · lint 0/0 · test 51/51
- [ ] (Opsional) E2E: `GET /admin/audit-logs` → kolom actor email/name & target email/name terisi, bukan blank

**Definition of Done:** nilai dari SQL diteruskan entity → response; tidak ada lagi hardcode blank.

### BUG-07 — UpdateUserUseCase tidak mencatat audit log
**File:** `src/application/use-cases/admin/UpdateUserUseCase.ts`

Fakta di kode: `DeleteUserUseCase`/`ResetUserPasswordUseCase`/`BroadcastMessageUseCase` memanggil
`logAdminAction`; `UpdateUserUseCase` (ban/suspend/reactivate + grant/revoke admin) **tidak inject**
`ActivityLogRepository` sama sekali. `AdminActionType.UPDATE_USER = "update_user"` ada di enum tapi 0 pemakaian
(verifikasi: satu-satunya match adalah deklarasi enum).

**TODO list:**
- [ ] Constructor: tambah `@inject("ActivityLogRepository") private activityLogRepo: ActivityLogRepository` (import `@domain/repositories/ActivityLogRepository.js`, pola sama seperti `DeleteUserUseCase`)
- [ ] Setelah `await this.userRepo.save(updatedUser);` → `logAdminAction`:
  - `adminId: input.adminId`, `action: AdminActionType.UPDATE_USER`, `targetType: "user"`, `targetId: input.targetUserId`
  - `details: { statusChanged: input.status !== undefined, isAdminChanged: input.isAdmin !== undefined, newStatus: input.status, newIsAdmin: input.isAdmin }`
  - `ip: input.requestIp`, `userAgent: input.requestUserAgent`
- [ ] Import `AdminActionType` dari `@domain/entities/AdminAction.js`
- [ ] Verifikasi: tsc 0 · lint 0/0 · test 51/51
- [ ] (Opsional) E2E: ban user test → `GET /admin/audit-logs` muncul entri `update_user`

**Definition of Done:** ban/suspend/grant-admin selalu tercatat di audit log.

### Report — Phase 3 ✅ SELESAI (2026-08-16)

| Bidang | Isi |
|---|---|
| **Eksekusi** | BUG-06 — `AdminAction.ts`: tambah 5 field optional di constructor + `create()` (`actorType`, `actorEmail`, `actorName`, `targetEmail`, `targetName`); `AdminAction.create()` untuk path SAVE tetap berfungsi tanpa perubahan. `PgAdminActionRepository.ts`: `AdminActionRow` + `mapRow()` kini membawa kelima kolom hasil JOIN. `GetAuditLogsUseCase` & `ExportAuditLogsUseCase`: hapus hardcode (`startsWith("user_")`, `null`, `""`) → nilai dari entity (`a.actorType`, `a.actorEmail ?? ""`, dst.). BUG-07 — `UpdateUserUseCase`: inject `ActivityLogRepository` + panggil `logAdminAction` dengan `AdminActionType.UPDATE_USER` + details (`statusChanged`/`isAdminChanged`/`newStatus`/`newIsAdmin`) setelah `userRepo.save`. |
| **Verifikasi** | `npx tsc --noEmit` → 0 error. `npm run lint` → 0 error, 0 warning. Boundary → 0. `npm test` → **7 files / 51 tests / 0 failed**. |
| **Temuan** | 1) `actorType` entity optional (karena path SAVE tidak punya data join) → use case pakai fallback `a.actorType ?? "admin"` agar tipe output `"admin" | "user"` aman; fallback tidak pernah terpakai untuk `findAll` (SQL selalu hitung `actor_type`). 2) `save()` di repo `RETURNING *` tanpa JOIN → kolom actor/target `undefined` untuk path SAVE — aman (field optional). 3) E2E `/admin/audit-logs` (butuh DB live) tidak dijalankan di fase ini — perubahan murni meneruskan data yang sudah dihitung SQL. |
| **DoD** | ✅ tercapai — nilai SQL diteruskan entity → response (Get + Export); tidak ada hardcode blank; ban/suspend/grant-admin tercatat `update_user`; suite hijau. |

---

## Phase 4 — Operasional & Scaling (BUG-08, BUG-11)

**Tujuan:** cegah pertumbuhan tabel tak terkendali & stale symbol sync. Preventive — tidak ada gejala saat ini.

### BUG-08 — `cleanupOlderThan` ada tapi tidak pernah dipanggil
**Files:** `src/application/use-cases/admin/SystemCleanupUseCase.ts`, `src/data/repositories/PgUsageRepository.ts`,
`PgCalendarRepository.ts`, `PgLoginAttemptRepository.ts`, `src/domain/repositories/ChatRepository.ts`,
`ActivityLogRepository.ts`

Fakta di kode: `HourlyCleanupJob` → `SystemCleanupUseCase` hanya membersihkan verify-token + news(7) + cache.
`PgUsageRepository.cleanupOlderThan` (token_usage), `PgCalendarRepository.cleanupOlderThan`, dan
`PgLoginAttemptRepository.cleanupOlderThan` **0 pemanggil**. `ChatRepository` & `ActivityLogRepository` tidak punya
method cleanup sama sekali. `token_usage` + `chat_logs` tumbuh ±1 baris per pesan chat — data paling cepat tumbuh.

**Keputusan retention (default yang disarankan — bisa disesuaikan):**
| Tabel | Retention | Catatan |
|---|---|---|
| `token_usage` | 90 hari | Paling cepat tumbuh |
| `chat_logs` | 90 hari | Paling cepat tumbuh |
| `user_activity_logs` | 90 hari | — |
| `failed_login_attempts` | 30 hari | — |
| `calendar_events` | **JANGAN auto-delete** | Data historis untuk backtest (rekomendasi report) |
| `admin_actions` | **JANGAN auto-delete** | Audit trail compliance (keputusan saya: exclude) |

**TODO list:**
- [ ] `ChatRepository` (interface): tambah `cleanupOlderThan(days: number): Promise<number>`
- [ ] `PgChatRepository`: implement `cleanupOlderThan` — `DELETE FROM chat_logs WHERE created_at < NOW() - INTERVAL '1 day' * $1` (pola sama seperti repo lain)
- [ ] `ActivityLogRepository` (interface): tambah `cleanupOlderThan(days: number): Promise<number>`
- [ ] `PgActivityLogRepository`: implement — `DELETE FROM user_activity_logs WHERE created_at < NOW() - INTERVAL '1 day' * $1` (**jangan** sentuh `admin_actions`)
- [ ] `SystemCleanupUseCase`: inject `UsageRepository`, `LoginAttemptRepository`, `ChatRepository`, `ActivityLogRepository`; tambah ke `Promise.allSettled` → `usageRepo.cleanupOlderThan(90)`, `loginAttemptRepo.cleanupOlderThan(30)`, `chatRepo.cleanupOlderThan(90)`, `activityLogRepo.cleanupOlderThan(90)` (kalendar & admin_actions di-exclude — catat di komentar + log label)
- [ ] Pastikan token DI baru terdaftar di `src/bootstrap/container.ts` kalau perlu
- [ ] Verifikasi wajib: tsc 0 · lint 0/0 · boundary 0 · test 51/51
- [ ] (Opsional) Test unit `SystemCleanupUseCase` dengan mock repo (assert semua method terpanggil)

**Definition of Done:** semua tabel tinggi-volume punya cleanup yang benar-benar ter-wire ke job; admin_actions & calendar di-exclude secara eksplisit.

### BUG-11 — Symbol sync di-skip berdasarkan total count
**File:** `src/application/services/SymbolService.ts`

Fakta di kode: `count === storedCount → return` — skip total. Tambah-1 + hapus-1 (net count sama), atau edit
`description`/`category`/`trade_mode` (status aktif) tanpa ubah total → `broker_symbols` stale **selamanya**.
Ini memperparah M4 (`trade_mode` belum dimodelkan) — begitu field itu ada, sync tetap tidak mendeteksi flip
same-count.

**TODO list:**
- [ ] `syncBrokerSymbols()`: hapus gate `count === storedCount`; selalu `fetchSymbols()` + `saveMany()` (sudah idempotent via `ON CONFLICT DO UPDATE`)
- [ ] Count hanya jadi sinyal log/sanity: `setStoredCount(symbols.length)` + `logger.info(...)`
- [ ] Jangan ubah `getActiveSymbols`/`fetchSymbolCount` — hanya heuristik skip yang dihilangkan
- [ ] Verifikasi wajib: tsc 0 · lint 0/0 · test 51/51
- [ ] (Opsional) Catat: kalau khawatir beban MT5 bridge, throttle eksplisit (mis. skip kalau <N jam sejak run) — keputusan terpisah, bukan count-equality

**Definition of Done:** sync selalu jalan; count murni logging.

### Report — Phase 4 ✅ SELESAI (2026-08-16)

| Bidang | Isi |
|---|---|
| **Eksekusi** | BUG-08 — `ChatRepository` (interface) + `PgChatRepository`: tambah `cleanupOlderThan` (`DELETE FROM chat_logs WHERE created_at < NOW() - INTERVAL '1 day' * $1`). `ActivityLogRepository` (interface) + `PgActivityLogRepository`: tambah `cleanupOlderThan` — hanya `user_activity_logs` (admin_actions di-exclude, audit trail). `SystemCleanupUseCase`: inject `UsageRepository`/`LoginAttemptRepository`/`ChatRepository`/`ActivityLogRepository` + tambah ke `Promise.allSettled` — token_usage 90, failed_login 30, chat_logs 90, user_activity_logs 90; calendar & admin_actions **tidak** di-delete. BUG-11 — `SymbolService.syncBrokerSymbols`: hapus gate `count === storedCount`; selalu `fetchSymbols()` + `saveMany()` (idempotent via `ON CONFLICT`); count jadi logging/sanity (`setStoredCount(symbols.length)`). |
| **Verifikasi** | `npx tsc --noEmit` → 0 error. `npm run lint` → 0 error, 0 warning. Boundary → 0. `npm test` → **7 files / 51 tests / 0 failed**. |
| **Temuan** | 1) Container sudah punya keempat token DI (`UsageRepository`, `LoginAttemptRepository`, `ChatRepository`, `ActivityLogRepository`) — tidak perlu registrasi baru. 2) `calendar_events` sengaja dikecualikan (data backtest, sesuai rekomendasi report) dan `admin_actions` dikecualikan (keputusan: audit trail compliance). 3) `fetchSymbolCount`/`getStoredCount` masih dipakai di tempat lain (admin metrics dll.) — hanya heuristik skip yang dihapus, method tidak diubah. 4) E2E/observasi jangka panjang tidak dijalankan (preventive — tidak ada gejala saat ini). |
| **DoD** | ✅ tercapai — semua tabel high-volume ter-wire ke `HourlyCleanupJob`; calendar & admin_actions di-exclude eksplisit; sync symbol selalu jalan; suite hijau. |

---

## Phase 5 — Auth Hardening (BUG-04, BUG-09, BUG-10)

**Tujuan:** perkuat pertahanan login & binding device. **Semua butuh keputusan produk — arahan user ada di §4.**

### BUG-04 — Login lockout policy (layered, bukan hard lock)
**Files:** `src/data/repositories/PgLoginAttemptRepository.ts`, `src/application/use-cases/auth/LoginUseCase.ts`,
`src/domain/repositories/LoginAttemptRepository.ts`

Fakta di kode: `isAccountLocked` = `(email, ip)` ≥10 gagal/15 menit → lock. Rotasi IP tidak pernah kena lock;
hard lock juga bisa dipakai DoS akun orang lain. **Arahan user (policy):** progressive delay per akun + IP throttle
yang sudah ada + CAPTCHA di percobaan ke-5; **hapus hard lock 15 menit**.

**TODO list:**
- [ ] `LoginAttemptRepository` (interface) + `PgLoginAttemptRepository`: ganti/ tambah method — mis. `countRecentFailures(email, windowMinutes): Promise<number>` (tanpa `ip`), pertahankan `recordFailedLogin`/`clearFailedLogins`/`cleanupOlderThan`
- [ ] `LoginUseCase`: hapus `isAccountLocked` hard lock → **progressive delay**:
  - gagal 1–5: tanpa penalti
  - gagal ke-6+: delay naik sebelum proses (1s, 2s, 4s, ... capped, mis. 30s) — `await sleep(...)`
  - delay dihitung dari `countRecentFailures(email)` setelah record gagal (atau sebelum verifikasi password — tentukan saat eksekusi agar konsisten)
- [ ] **CAPTCHA di percobaan ke-5: keputusan implementasi terbuka** — (a) challenge in-app sederhana tanpa pihak ketiga, atau (b) layanan eksternal (mis. Cloudflare Turnstile — riset & gravity index dulu sebelum integrasi). **Konfirmasi ke user sebelum eksekusi.**
- [ ] (Opsional, rekomendasi Claude #4) Global per-email counter longgar: 20+ gagal/jam dari IP manapun → kirim email notifikasi "percobaan login mencurigakan" (bukan lock). Tambahkan kalau disetujui.
- [ ] Update unit test `LoginUseCase.test.ts`: kasus lockout lama diganti/ ditambah tes progressive delay (pastikan delay kecil di test — inject sleep atau fake timer)
- [ ] Verifikasi wajib: tsc 0 · lint 0/0 · boundary 0 · test hijau (jumlah test bisa berubah — update angka di laporan)
- [ ] (Opsional) E2E: brute-force 6+ gagal → respons melambat (delay), bukan 401 lockout instan

**Definition of Done:** tidak ada hard lock 15 menit; ada progressive delay per email; CAPTCHA (sesuai keputusan) aktif dari percobaan ke-5.

### BUG-09 — Device bind TOCTOU race
**Files:** `src/data/repositories/PgDeviceRepository.ts` (`bind`), `src/application/use-cases/auth/RegisterUseCase.ts`,
`src/application/services/AuthService.ts` (`establishAuthenticatedSession`)

Fakta di kode: `RegisterUseCase` cek `findUserByFingerprint` lalu `bind()` = 2 langkah non-atomik; `bind()` pakai
`ON CONFLICT (device_fingerprint) DO UPDATE SET user_id = EXCLUDED.user_id` — dua registrasi konkuren dari device
sama bisa saling rampas akun tanpa error.

**TODO list:**
- [ ] `PgDeviceRepository.bind()`: SQL jadi
  ```sql
  INSERT INTO user_devices (id, user_id, device_fingerprint, created_at, last_seen_at)
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (device_fingerprint) DO UPDATE SET
    last_seen_at = EXCLUDED.last_seen_at
  WHERE user_devices.user_id = EXCLUDED.user_id
  RETURNING *
  ```
  (drop `user_id = EXCLUDED.user_id` dari SET — tidak boleh reassign ownership)
- [ ] `RegisterUseCase`: `bind()` return null (row ter-exclude = fingerprint milik akun lain) → **rollback** user yang baru dibuat (delete user + verification record) → throw `ConflictError` yang sama dengan pre-check
- [ ] `AuthService.establishAuthenticatedSession`: `bind()` return null → **keputusan kecil terbuka**: (a) blok login dengan error konsisten (ConflictError), atau (b) izinkan login tanpa update device. **Rekomendasi saya: (a) blok** — konsisten dengan register; konfirmasi saat eksekusi.
- [ ] (Catatan) `setSessionForDeviceAtomic` (Redis, SET NX) sudah benar — tidak perlu diubah
- [ ] Verifikasi wajib: tsc 0 · lint 0/0 · boundary 0 · test 51/51 (perilaku login normal tidak berubah)
- [ ] (Opsional) E2E: 2 registrasi konkuren fingerprint sama → 1 sukses, 1 ConflictError

**Definition of Done:** bind tidak pernah reassign ownership; race → ConflictError bukan rampasan senyap.

### BUG-10 — Google OAuth account matching (reclaim, bukan auto-login buta)
**Files:** `src/config/passport.ts` (Google strategy), `src/presentation/controllers/AuthController.ts` (`googleCallback`)

Fakta di kode: Google strategy `findByEmail(email)` → user ada (alasan apa pun, termasuk akun password yang belum
pernah verified) → langsung `done(null, user)` tanpa cek `emailVerified`/`googleId`. `googleCallback` juga tanpa
check — beda dengan `LoginUseCase` yang punya `requireVerification && !user.emailVerified`. Celah: attacker
pre-register email korban (akun unverified), korban login Google → masuk akun attacker. **Arahan user (policy):**
Google membuktikan kepemilikan email lebih kuat → **reclaim akun**, bukan sekadar blok.

**TODO list:**
- [ ] `passport.ts` (Google strategy), setelah `findByEmail`:
  - user existing & `emailVerified === true` → auto-link, `done(null, user)` (perilaku sekarang, aman)
  - user existing & `emailVerified !== true` → **reclaim**: set `emailVerified = true` + `passwordHash = null` (invalidasi password lama → paksa reset; batalkan akses siapapun yang set password di situ) → simpan → lanjut login
  - (cek entity `User` — gunakan method domain yang ada / tambahkan `withEmailVerified`/`withClearedPassword` kalau perlu; jangan mutasi field publik sembarangan)
- [ ] `AuthController.googleCallback`: tidak berubah (session dibuat dari user hasil reclaim) — verifikasi tidak ada cek tambahan yang dibutuhkan
- [ ] (Keputusan terpisah, flag) Verifikasi email sebagai **gerbang identitas wajib** (tidak opsional): `requireEmailVerification` default true / dihapus — per Claude, akun password harus verified dulu sebelum dianggap milik pemegang email. **Konfirmasi ke user** (perubahan perilaku login).
- [ ] Verifikasi wajib: tsc 0 · lint 0/0 · boundary 0 · test 51/51
- [ ] (Catatan) E2E penuh butuh browser Google (tidak mudah diotomasi) — validasi via unit test helper/refactor kecil kalau memungkinkan, atau dokumentasikan keterbatasan

**Definition of Done:** akun unverified yang di-claim Google → verified + password lama dinonaktifkan + login sukses; akun verified → auto-link normal.

### Report — Phase 5 ✅ SELESAI (2026-08-16)

**Keputusan user yang dipakai:** (1) CAPTCHA opsi (a) — in-app sederhana, wireable ke FE; (2) BUG-09 blok login saat device milik akun lain; (3) `requireEmailVerification` tetap toggle .env (tidak diubah).

| Bidang | Isi |
|---|---|
| **Eksekusi** | **BUG-04 (layered lockout)** — `domain/services/loginPolicy.ts` (pure: `computeLoginDelaySeconds` 1s/2s/4s…cap 30s mulai kegagalan ke-6, `isCaptchaRequired` ≥5, window 15 menit) + `CaptchaStore` (port) + `RedisCaptchaStore` (data, TTL 5 menit) + `CaptchaService` (application, challenge matematika in-app, jawaban sha256, sekali pakai) + `CaptchaRequiredError` (428, details.challenge). `LoginAttemptRepository`/`PgLoginAttemptRepository`: `isAccountLocked` → `countRecentFailures(email, window)` (SEMUA IP — rotasi IP tak bisa lolos). `LoginUseCase`: captcha gate (salah → recordFailedLogin + challenge baru; tidak dikirim → tidak dihitung) → progressive delay → flow lama. `loginDto` + `AuthController.login`: field `captcha { challengeId, answer }`. Hard lock 15 menit **dihapus**. **BUG-09** — `PgDeviceRepository.bind`: `ON CONFLICT DO UPDATE SET last_seen_at` + `WHERE user_devices.user_id = EXCLUDED.user_id` (user_id tidak pernah reassign; konflik antar akun → return null); `RegisterUseCase`: bind null → rollback user + `ConflictError`; `AuthService.establishAuthenticatedSession`: bind SEBELUM session, null → blok 403. **BUG-10** — `passport.ts`: akun existing `emailVerified=true` → auto-link; `!emailVerified` → **reclaim** (`withEmailVerified()` + `withPasswordHash(null)`, method baru di entity User) → save → login. |
| **Verifikasi** | `npx tsc --noEmit` → 0 error. `npm run lint` → 0 error, 0 warning. Boundary → 0. `npm test` → **8 files / 57 tests / 0 failed** (baru: `loginPolicy.test.ts` 6 test; LoginUseCase.test diperbarui ke flow captcha). |
| **Temuan** | 1) Tanpa captcha tidak dicatat sebagai kegagalan — hanya captcha yang dikirim tapi salah (keputusan perilaku: blocked-attempt ≠ credential failure, counter user sah tidak naik). 2) Delay dijalankan sebelum `findByEmail` — timing tidak membocorkan keberadaan akun. 3) Kontrak FE: challenge di-embed langsung di response 428 (`details.challenge`) — FE tidak perlu endpoint terpisah. 4) E2E live dijalankan di follow-up (§8r session-context): BUG-04 & BUG-09 terverifikasi live; BUG-10 hanya unit test (butuh browser Google). 5) `googleId` tidak di-set saat reclaim — **sudah diperbaiki di follow-up** (`User.withGoogleId()` + rantai reclaim di `passport.ts`, lihat §8r). 6) Status blok device tadinya 401 — **diperbaiki ke 403 FORBIDDEN** (`AuthorizationError` + `details` opsional) setelah ditemukan saat E2E live. |
| **DoD** | ✅ tercapai — hard lock 15 menit hilang; progressive delay + CAPTCHA aktif; bind tidak pernah reassign ownership + blok login; OAuth reclaim akun unverified; suite hijau (8 files / 57 tests). |

---

## 4. Keputusan Produk (dari user — arahan Claude, 2026-08-16)

**BUG-04 — Login lockout policy (layered, standar Auth0/Microsoft/OWASP ASVS):**
1. **Progressive delay per akun** (bukan hard lock) — gagal ke-1–5 tanpa penalti; ke-6+ delay naik (1s, 2s, 4s... capped). Brute force melambat tanpa pernah mengunci user asli.
2. **Per-IP throttle tetap** (sudah ada `authLimiter` 10/5 menit) — menahan automated attack satu sumber.
3. **CAPTCHA setelah ±5 percobaan** — ramah user, ampuh lawan bot.
4. (Opsional) **Global per-email counter longgar** — 20+ gagal/jam dari IP manapun → email notifikasi "percobaan login mencurigakan" + opsi paksa re-verify via email link.
5. Kalau butuh hard lock untuk compliance: scope per device/session baru, bukan per akun.
- **Keputusan untuk Betrix:** kombinasi 1+2+3 cukup; **hapus hard lock 15 menit**.

**BUG-10 — OAuth account matching (standar Auth0/Firebase/Supabase):**
- Prinsip: **jangan pernah auto-link akun berdasarkan email mentah kalau akun lokal belum terverifikasi**.
- Akun existing `emailVerified = true` → auto-link, langsung login.
- Akun existing belum verified → **reclaim**: Google baru membuktikan pemilik asli email → set `emailVerified = true`, **invalidasi password lama** (paksa reset), baru login.
- Prinsip tambahan: verifikasi email harusnya **gerbang identitas**, bukan opsional (akun password wajib verified sebelum dianggap milik pemegang email).

**Keputusan terbuka yang harus dikonfirmasi saat eksekusi Phase 5:**
1. Implementasi CAPTCHA: in-app sederhana vs Turnstile (riset dulu).
2. BUG-09 perilaku login saat device milik akun lain: blok (rekomendasi) vs izinkan tanpa update device.
3. `requireEmailVerification` jadi wajib (default true / dihapus toggle)?

---

## 5. Cara Pakai & Update Konteks

1. **Kerjakan per phase** — urutan 1 → 2 → 3 → 4 → 5. Verifikasi wajib tiap phase (tsc/lint/boundary/test) harus hijau sebelum lanjut.
2. **Setelah tiap bug selesai:** isi bagian **Report** (Eksekusi/Verifikasi/Temuan/DoD) di file ini + update matriks status (§2).
3. **Update `docs/session-context.md`:** tambah section baru per penyelesaian (pola §8b–8j), perbarui angka verifikasi final di header, dan catat keputusan baru di §5 bila ada.
4. **Jangan** mengubah perilaku di luar scope bug (kecuali diminta) — fokus per TODO.
5. File ber-CRLF: kalau `write_file` gagal di file `.ts` (CRLF), pakai `str_replace` berlapis (gotcha §6.1 session-context).
6. Laporan final bug-report (`docs/betrix-backend-bug-report.md`) TIDAK diedit — biarkan sebagai sumber; status ada di file ini + session-context.

---

## 6. Kepatuhan DDD — semua fix Bug 1–11 (diverifikasi 2026-08-16)

**Verdict:** seluruh perbaikan 11 bug tetap menganut arsitektur DDD yang ditetapkan saat refactor — tidak ada yang menaruh logic di lapisan salah. Verifikasi dari kode + suite:

| Check | Hasil |
|---|---|
| Boundary `import/no-restricted-paths` | **0 pelanggaran** |
| `npx tsc --noEmit` | **0 error** |
| `npm run lint` | **0 error / 0 warning** |
| `npm test` | **8 files / 57 tests / 0 failed** |

**Bukti per lapisan:**

- **Domain — tetap murni** (tidak import keluar): `loginPolicy.ts` (BUG-04) 0 import, pure function; `CaptchaStore.ts` (BUG-04) port interface di `domain/repositories`; `AdminAction.ts` (BUG-06) field baru readonly optional tanpa import; `User.ts` (BUG-10) `withEmailVerified()`/`withPasswordHash()` pakai pola immutability yang sama dengan `withStatus()`/`withCredits()`.
- **Application — orchestrator murni + DI penuh**: `LoginUseCase` (BUG-04) import hanya `@domain/*` + `@core/*` (type-only `AppSettings` — env tetap hanya dibaca di `bootstrap/container.ts`), 9 dependensi via `@inject`; `UpdateUserUseCase` (BUG-07) inject `ActivityLogRepository` (port domain); `CaptchaService` (BUG-04) consume port `CaptchaStore`, bukan implementasi konkret; `AuthService` (BUG-09) import hanya domain.
- **Data — adapter mengimplementasi port**: `RedisCaptchaStore` (BUG-04), `PgDeviceRepository` (BUG-09), `PgAdminActionRepository` (BUG-06), `PgChatRepository`/`PgActivityLogRepository` (BUG-08) — semua pola `Pg*/Redis*` yang sama.
- **Presentation/Core/Bootstrap — pola tidak berubah**: controller tetap constructor DI tanpa `container.resolve`; `CaptchaRequiredError` (428) di `@core/errors`; registrasi token baru hanya di `bootstrap/container.ts`.
- **Catatan (bukan pelanggaran):** `config/passport.ts` (BUG-10) menyentuh entity & repo — wajar, karena passport adalah adapter auth framework yang memang hidup di layer config; boundary check 0 membuktikan tidak melanggar aturan dependensi.

**Kesimpulan:** fix 11 bug = perpanjangan dari refactor DDD, bukan pengecualian. Lapisan tetap satu arah: `domain ← application ← data/presentation`.
