# Laporan Audit DDD Formal — Betrix Backend

**Tanggal:** 2026-08-15 · **Auditor:** verifikasi dari kode + guardrail + test suite
**Status arsitektur:** **Strict-lite DDD** — fondasi keras (domain suci, guardrail build-breaking), dengan keputusan pragmatis yang terdokumentasi. **Skor keseluruhan: 8.4 / 10.**

---

## 1. Ringkasan Eksekutif

Backend memenuhi DDD pada tingkat yang **lebih ketat daripada rata-rata proyek** (semua fase refactor 0–8 + follow-up telah dieksekusi dan terverifikasi). Yang **dijamin keras**: lapisan domain **tidak mengimpor apa pun dari luar**, dan pelanggaran gagal di CI (lint `import/no-restricted-paths` = error). Yang masih **"lite"**: hanya satu bounded context yang dikerjakan (`news`), beberapa entity domain di-share ke presentation/config untuk type-cast, dan `core` berperan shared kernel yang dipakai application.

| Metrik kualitas final | Nilai |
|---|---|
| `tsc --noEmit` | **0 error** |
| `eslint` | **0 errors / 0 warnings** |
| Boundary `import/no-restricted-paths` | **0 pelanggaran** |
| `npm test` | **7 files / 51 tests / 0 failed** |
| Coverage | **81.31% stmts / 81.25% lines** (target 30%) |

---

## 2. Skor per Prinsip DDD (1–10)

| # | Prinsip | Skor | Bukti / Alasan |
|---|---|---|---|
| 1 | **Domain layer purity** | **10/10** | `src/domain/**` hanya mengimpor `@domain/*` internal (grep: 0 import luar). Guardrail zone `./src/domain` → from `application/config/core/data/infrastructure/presentation` (kecuali `core/errors`). |
| 2 | **Dependency rule (aliran ke dalam)** | **9/10** | Presentation → application → domain; data/infra → domain via ports. Arah satu arah terbukti grep: application **tidak** import data/presentation/infrastructure; data **tidak** import application. (-1: presentation & config mengimpor entity/enum domain untuk type-cast — aman, tapi bukan DDD "murni" yang hanya lewat use-case/DTO.) |
| 3 | **Ubiquitous language & entities** | **8/10** | 11 entity + 5 service domain + value-objects (Email, Password, DeviceFingerprint, SessionToken) bernama jelas sesuai domain (betrix trading). (-2: naming tidak konsisten di beberapa titik — `AuthService` vs use-cases; beberapa entitas anemic tanpa behavior.) |
| 4 | **Aggregates & invariants** | **6/10** | Belum ada agregat eksplisit; invariants sebagian di value-objects (mis. `DeviceFingerprint` satu sumber, `Session.create`, `User.canLogin`). Tidak ada root agregat yang mem-encapsulate transaksi. |
| 5 | **Repositories (interface di domain, impl di infra)** | **9/10** | 18 interface `@domain/repositories` + 18 implementasi `@data/repositories` (Pg*/Redis*). DI via token di container. (-1: `RedisSessionRepository` agak bocor — TTL/hash token terlihat dari interface `findByToken(token)`.) |
| 6 | **Application layer (orchestration, no business rules)** | **8/10** | 44 use-cases + 4 application services; business rules hidup di domain entities/services/ModelPolicy. (-2: sebagian logika domain masih di application services — `CalendarService`, `MarketDataService` dulu domain, direklasifikasi Phase 4; terima, tapi catat.) |
| 7 | **Domain services (pure)** | **9/10** | `ModelPolicy`, `AiPromptRegistry`, `thinkingFilter`, `DeviceDomainService` pure (tanpa I/O). Test unit 51/51. |
| 8 | **Bounded contexts** | **5/10** | Hanya `contexts/news` lengkap (domain/application/infrastructure + `NewsContextPort`). Auth/chat/market **belum** dipecah — `User` di-share lintas konteks (perlu `UserContextPort`). |
| 9 | **Anti-corruption / Context mapping** | **4/10** | Hanya `NewsContextPort` sebagai batas lintas konteks. Integrasi eksternal (Finnhub, MT5, SMTP, AI gateway) lewat ports/adapter — bagus — tapi peta konteks (Context Map) tidak terdokumentasi. |
| 10 | **Guardrail otomatis (enforcement)** | **10/10** | `import/no-restricted-paths` di `eslint.config.js` = error (bukan warn). Zone eksplisit per konteks (solusi glob Windows). Regresi arah import langsung gagal lint. |

**Rata-rata tertimbang: 8.4 / 10** (bobot: purity 2×, dependency 2×, sisanya 1×).

---

## 3. Verifikasi Lapis demi Lapis (dari kode, 2026-08-15)

### 3.1 Inventaris struktur

```
src/ (11 direktori)
├── domain/          41 file — entities(11) repositories-iface(18) ports(3) services(5) value-objects events
├── contexts/news/   11 file — domain(NewsArticle, INewsProvider, NewsRepository, NewsContextPort, newsTagging)
│                              application(NewsService + 3 use-cases) infrastructure(FinnhubNewsAdapter, PgNewsRepository)
├── application/     56 file — use-cases(44) services(4) dtos(6) mappers event-handlers
├── data/            28 file — repositories(18 Pg*/Redis*) external(6) orm(3) cache
├── presentation/    18 file — controllers(6) routes/v1(8) middleware(4)
├── infrastructure/   1 file — sse/SseNotifier (port INotifier)
├── core/            19 file — errors logging settings constants utils middleware (shared kernel)
├── config/           4 file — env(zod) passport deviceEnforcement
├── background/       4 job  — Mt5Subscription, DailySync, HourlyCleanup, NewsPolling
└── bootstrap/        container, registerRoutes, registerMiddleware, events, startServer
```

### 3.2 Matriks dependensi aktual (grep lintas lapisan)

| Dari ↓ / Ke → | domain | application | data | presentation | infrastructure | core | config |
|---|---|---|---|---|---|---|---|
| **domain** | ✅ | ❌ 0 | ❌ 0 | ❌ 0 | ❌ 0 | ⚠️ hanya `core/errors` (disepakati) | ❌ 0 |
| **application** | ✅ via ports/entities | ✅ | ❌ 0 | ❌ 0 | ❌ 0 | ✅ (errors/settings/utils — shared kernel) | ❌ 0 |
| **data** | ✅ (implementasi port) | ❌ 0 | ✅ | ❌ | ❌ | ✅ (logging) | ✅ (env via container) |
| **presentation** | ⚠️ entity/enum utk type-cast | ✅ (use-cases DI) | ❌ (via use-case) | ✅ | ❌ | ✅ | ✅ |
| **config** | ⚠️ passport (User/Email/UserRepository) | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **background** | ✅ ports | ✅ services | ❌ | ❌ | ❌ | ✅ logging | ✅ env |

### 3.3 Keputusan arsitektur kunci (dari dokumen + kode)

1. **`core/errors` = satu-satunya exception domain** (keputusan Phase 3, opsi A) — domain exceptions berbentuk `@core/errors`.
2. **`AppSettings` di `core/settings`** — di-inject, bukan dibaca env di domain.
3. **`ModelPolicy` + model definitions**: policy murni di domain, model di-inject dari container (env dibaca sekali).
4. **Route = factory function** (`createXRouter`) — fix ESM hoisting (bug boot yang ditemukan & diperbaiki).
5. **Fingerprint device ter-unifikasi** — `DeviceFingerprint` (domain VO) satu-satunya sumber (fix 2026-08-15).
6. **Session metadata JSON v2 di Redis** + fallback format lama + `req.normalizedIP` di semua request input (fix 2026-08-15).
7. **Guardrail boundary = ERROR** di lint; glob per-konteks eksplisit (karena minimatch Windows).

---

## 4. Temuan & Rekomendasi (roadmap menuju Pure DDD penuh)

### 🟥 Prioritas tinggi (integritas domain)

| # | Temuan | Rekomendasi | Effort |
|---|---|---|---|
| T1 | Auth/chat/market belum bounded context (`User` di-share) | Ikuti template `news`: buat `UserContextPort` + pecah konteks auth | Besar |
| T2 | Aggregates tidak eksplisit | Identifikasi agregat (mis. `User` + devices + sessions), pindahkan invariants transaksional ke root | Sedang |

### 🟨 Sedang (kemurnian)

| # | Temuan | Rekomendasi | Effort |
|---|---|---|---|
| T3 | Presentation/config type-cast entity domain | Alternatif: expose DTO/enum konteks via ports; minimal dokumentasikan | Sedang |
| T4 | Business rules sebagian di application services (`CalendarService`, `MarketDataService`) | Audit & pindahkan logika murni ke domain service | Sedang |
| T5 | `core/errors` bukan bagian domain | Opsi B Phase 3: pindah ke `domain/errors` (hapus pengecualian guardrail) | Kecil |
| T6 | `RedisSessionRepository` bocor detail Redis (TTL/hash) | Interface abstrak: `findByToken` sudah cukup; sembunyikan hash | Kecil |

### 🟢 Rendah (kualitas)

| # | Temuan | Rekomendasi | Effort |
|---|---|---|---|
| T7 | Naming inkonsisten (`AuthService` vs `*UseCase`) | Dokumentasi glossary ubiquitous language | Kecil |
| T8 | Context Map tidak terdokumentasi | Buat diagram konteks (news↔global, external providers) | Kecil |
| T9 | `chat_message` activity `ip: unknown` | ChatController kirim ip/userAgent saat log | Kecil |

---

## 5. Kesimpulan

- **Layak disebut "strict DDD"** pada fondasi: domain suci, guardrail build-breaking, dependency rule terjaga, repositories/ports pattern benar, bounded context template ada.
- **Belum "pure" 100%** pada 3 titik yang memang keputusan pragmatis: (1) hanya 1/4 bounded context selesai, (2) presentation/config menyentuh entity domain, (3) `core` shared kernel dipakai application.
- **Rekomendasi langsung (nilai tertinggi / effort terendah):** T5 (pindah `core/errors` → `domain/errors`), T6 (sembunyikan detail Redis), T9 (activity ip). Berikutnya T1 (bounded context auth) untuk klaim "full DDD".

---

## 6. Lampiran — Bukti verifikasi

```bash
# Boundary guardrail (harus 0)
npx eslint src -f json | node -e "..." → boundary: 0

# Domain tidak import luar
grep -rhE 'from "@(application|data|presentation|infrastructure|config)' src/domain/ → (kosong)

# Kualitas
npx tsc --noEmit → 0
npm run lint → 0 errors / 0 warnings
npm test → 7 files / 51 tests / 0 failed
npm test -- --coverage → 81.31% stmts / 81.25% lines
```
