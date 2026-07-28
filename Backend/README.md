# BETRIX Backend

Backend + AI orchestration layer untuk Betrix — platform sinyal/analisis trading forex berbasis AI. Dokumen ini mencakup keseluruhan proyek: arsitektur, setup lokal, keamanan, operasional/deployment, sampai referensi API untuk tim frontend.

---

## Daftar Isi

1. [Ringkasan & Stack](#1-ringkasan--stack)
2. [Struktur Proyek](#2-struktur-proyek)
3. [Setup Lokal](#3-setup-lokal)
4. [Environment Variables](#4-environment-variables)
5. [Model Data (Database)](#5-model-data-database)
6. [Keamanan](#6-keamanan)
7. [Rate Limiting & Proteksi Abuse](#7-rate-limiting--proteksi-abuse)
8. [Background Jobs](#8-background-jobs)
9. [Operasional & Deployment](#9-operasional--deployment)
10. [Panduan Integrasi Frontend](#10-panduan-integrasi-frontend)
11. [Known Limitations](#11-known-limitations)

---

## 1. Ringkasan & Stack

- **Runtime:** Node.js / Express (ESM, `"type": "module"`)
- **Database:** PostgreSQL (kompatibel Neon — SSL wajib di luar `development`+`localhost`)
- **Cache/session store:** Upstash Redis (REST client, `@upstash/redis`)
- **AI:** Genfity AI Gateway (lewat `services/aiClient.js` + `services/modelRouter.js`, routing ke 3 tier model: cheap/balanced/deep)
- **Market data:** MT5 Bridge custom (`services/mt5Client.js`) via WebSocket, diteruskan ke client lewat SSE
- **Auth:** session token custom (bukan JWT) — token random 32-byte, TTL 24 jam tetap, disimpan di Redis; plus Google OAuth (Passport)
- **Email:** Nodemailer (SMTP)
- **Logging:** Winston + daily rotate file

Proyek ini adalah bagian **Backend** dari monorepo Betrix, yang juga punya `Frontend - Admin` dan `Frontend - Client` sebagai konsumen API ini.

---

## 2. Struktur Proyek

```
Backend/
├── src/
│   ├── server.js              # Entry point — setup Express, middleware, rate limiter, graceful shutdown
│   ├── config/
│   │   ├── models.js          # Konfigurasi tier model AI
│   │   └── passport.js        # Strategi Google OAuth
│   ├── db/
│   │   ├── pool.js            # Postgres connection pool
│   │   ├── redis.js           # Upstash Redis client
│   │   └── migrate.js         # Migrasi schema (idempotent, jalan manual via `npm run migrate`)
│   ├── middleware/
│   │   ├── auth.js            # requireAuth — validasi session token
│   │   ├── adminAuth.js       # requireAdmin — cek is_admin + status dari DB
│   │   ├── credits.js         # requireCredits — potong credit sebelum handler jalan
│   │   ├── sanitize.js        # (saat ini no-op — lihat bagian Keamanan)
│   │   ├── normalizeIP.js     # Normalisasi IPv6-mapped / localhost
│   │   ├── rateLimitPerUser.js
│   │   └── requestLogger.js   # Log tiap request + request ID
│   ├── routes/                # auth, chat, market, news, messages, admin, activity, usage, health
│   ├── services/               # Semua business logic & akses data (session, credit, device, email, dst)
│   └── utils/                  # csv export, logger, device fingerprint, startup banner, dll
├── package.json
└── README.md
```

Konvensi: `routes/` cuma orkestrasi HTTP (parsing request, panggil service, format response) — logic & query DB ada di `services/`.

---

## 3. Setup Lokal

Prasyarat: Node.js 18+ (butuh `crypto.randomUUID`, `AbortController`, dan `server.requestTimeout`-compatible API), PostgreSQL, akun Upstash Redis.

```bash
cd Backend
npm install

# siapkan .env (lihat daftar variabel di bagian 4)
cp .env.example .env   # kalau belum ada file .env.example, buat manual dari daftar di bawah

# jalankan migrasi (idempotent — aman dijalankan berkali-kali)
npm run migrate

# dev (auto-restart pakai --watch)
npm run dev

# production
npm start
```

`GET /health` dipakai untuk healthcheck (tidak butuh auth, tidak kena rate limit).

---

## 4. Environment Variables

| Variabel | Wajib? | Default | Keterangan |
|---|---|---|---|
| `PORT` | tidak | `3000` | Port HTTP |
| `NODE_ENV` | tidak | `development` | `development` + `DB_HOST=localhost` → SSL Postgres dimatikan |
| `DATABASE_URL` | **ya** | — | Connection string Postgres |
| `DB_HOST` | tidak | — | Dipakai bareng `NODE_ENV` untuk deteksi SSL lokal |
| `DB_POOL_MAX` | tidak | `20` | Max koneksi pool |
| `DB_IDLE_TIMEOUT_MS` | tidak | `30000` | |
| `DB_CONNECT_TIMEOUT_MS` | tidak | `5000` | |
| `DB_STATEMENT_TIMEOUT_MS` | tidak | `10000` | Batas waktu Postgres eksekusi 1 statement |
| `DB_QUERY_TIMEOUT_MS` | tidak | `15000` | Batas waktu client menunggu hasil query |
| `UPSTASH_REDIS_REST_URL` | **ya** | — | |
| `UPSTASH_REDIS_REST_TOKEN` | **ya** | — | |
| `ALLOWED_ORIGINS` | tidak | `http://localhost:3000,http://localhost:5173` | CSV origin untuk CORS whitelist |
| `TRUST_PROXY_HOPS` | tidak | `1` | Jumlah hop proxy tepercaya (nginx/load balancer) di depan Node — pengaruh ke `req.ip` |
| `SERVER_KEEPALIVE_TIMEOUT_MS` | tidak | `65000` | Proteksi slowloris |
| `SERVER_HEADERS_TIMEOUT_MS` | tidak | `66000` | Harus > `SERVER_KEEPALIVE_TIMEOUT_MS` |
| `SESSION_LOOKUP_TIMEOUT_MS` | tidak | — | Timeout lookup session ke Redis |
| `RATE_LIMIT_PER_MINUTE` | tidak | `30` | Limiter global per-IP |
| `RATE_LIMIT_PER_USER_PER_MINUTE` | tidak | — | Limiter chat per-user |
| `RATE_LIMIT_REGISTER_PER_HOUR` | tidak | `5` | |
| `RATE_LIMIT_MARKET_PER_MINUTE` | tidak | `120` | |
| `MARKET_MAX_STREAMS_PER_USER` | tidak | `5` | Cap koneksi SSE market per user |
| `DEVICE_ENFORCEMENT` | tidak | — | `true`/`false` — aktifkan aturan 1 device = 1 akun |
| `REQUIRE_EMAIL_VERIFICATION` | tidak | — | `true`/`false` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | untuk OAuth | — | |
| `FRONTEND_URL` | **ya** | `http://localhost:5173` | Dipakai untuk redirect OAuth & link di email |
| `BASE_URL` | tidak | — | URL publik backend (dipakai di email verifikasi, dll) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | untuk email | — | |
| `AI_API_KEY` / `AI_BASE_URL` | **ya** | — | Kredensial Genfity AI Gateway |
| `AI_REQUEST_TIMEOUT_MS` / `AI_STREAM_TIMEOUT_MS` | tidak | — | |
| `MODEL_CHEAP` / `MODEL_BALANCED` / `MODEL_DEEP` (+ `_MAX_TOKENS`) | tidak | lihat `config/models.js` | Nama model per tier |
| `FAQ_CACHE_TTL_DAYS` / `FAQ_CACHE_MAX_SIZE` | tidak | — | Cache in-memory untuk `taskType: faq`/`classify_signal` |
| `MT5_BRIDGE_URL` | **ya** (untuk market data) | — | |
| `LOG_LEVEL` | tidak | — | Level Winston |

> Catatan keamanan: pastikan `.env` **tidak pernah** ter-commit (sudah ada di `.gitignore`). Untuk production, `DATABASE_URL` harus mengarah ke instance dengan SSL aktif — kode sekarang menolak sertifikat tidak valid (`rejectUnauthorized: true`) di luar dev+localhost.

---

## 5. Model Data (Database)

Tabel utama (dibuat via `src/db/migrate.js`, migrasi bersifat idempotent/additive — aman dijalankan ulang):

| Tabel | Fungsi |
|---|---|
| `users` | Akun, termasuk `status` (`active`/`banned`/`suspended`), `is_admin`, `email_verified`, `credits` |
| `chat_logs` | Riwayat percakapan AI per user |
| `admin_actions` | Audit trail aksi admin |
| `user_activity_logs` | Audit trail aksi user sendiri |
| `user_devices` | Binding device fingerprint ↔ user (device enforcement) |
| `failed_login_attempts` | Dipakai untuk lockout login (lihat bagian Keamanan) |
| `email_verifications` | Token verifikasi email & ganti email |
| `token_usage` | Metrik pemakaian token AI |
| `messages` | Inbox internal antar user/admin |
| `message_notification_preferences` | Preferensi notifikasi email per user |
| `news_articles` | Cache artikel berita (RSS fetcher) |
| `credit_transactions` | Ledger mutasi credit (potong, refund, top-up admin) |

---

## 6. Keamanan

Ringkasan mekanisme keamanan yang aktif, termasuk beberapa catatan trade-off yang perlu dipahami tim yang melanjutkan proyek ini:

### Autentikasi & sesi
- Session token 32-byte random, disimpan di Redis dengan TTL 24 jam tetap (tidak ada refresh/sliding).
- `validateSession()` mengecek `status` user di setiap request — kalau akun di-ban/suspend admin, session yang sedang aktif **langsung dicabut** (baik lewat revoke eksplisit di endpoint admin, maupun self-heal di `validateSession` kalau ada jalur lain yang mengubah status).
- Password login pakai `bcrypt`, dengan dummy-compare untuk email yang tidak terdaftar (mencegah timing attack untuk enumerasi akun).

### Device enforcement (opsional, via `DEVICE_ENFORCEMENT`)
- 1 device fingerprint (IP + User-Agent) hanya boleh terikat ke 1 akun.
- `bindDeviceToUser()` pakai transaksi + `SELECT ... FOR UPDATE` untuk cegah race condition saat bind.
- Registrasi yang kalah race (dua device-binding bersamaan) akan **rollback** (user row yang sudah terlanjur dibuat dihapus) supaya tidak ada akun "yatim" yang lolos device enforcement.
- **Batasan yang diketahui:** fingerprint berbasis IP+UA gampang dipalsukan lewat script/curl, dan berpotensi kolisi natural untuk user berbeda di jaringan yang sama (NAT kantor/kampus/carrier-grade). Ini proteksi lapis tambahan, bukan pengganti autentikasi utama.

### Lockout brute-force login
Dua lapis:
1. **Per (email, IP)** — 5x gagal dari IP yang sama mengunci kombinasi itu selama 15 menit. Melindungi pemilik akun asli: gagal login attacker dari IP-nya sendiri tidak mengunci akses pemilik akun dari IP lain.
2. **Global per-email** — 30x gagal lintas-IP (email sama) dalam window yang sama juga mengunci, untuk menangkap brute-force terdistribusi yang sengaja menghindari lapis pertama.

> Trade-off yang perlu disadari: lapis global tetap punya sisa risiko collateral lockout kalau penyerang benar-benar memakai puluhan IP berbeda. Solusi yang sepenuhnya menghilangkan risiko ini adalah step-up verification (CAPTCHA) setelah ambang tertentu, bukan hard lock — belum diimplementasikan.

### XSS / input sanitization
- Middleware `sanitizeInput` **saat ini no-op** (sengaja dinonaktifkan). Awalnya melakukan escaping HTML di semua field input, tapi itu **memutasi data yang tersimpan** (contoh: nama `O'Brien` tersimpan jadi `O&#39;Brien`) — sebuah bug data-integrity.
- Keputusan sekarang: **backend tidak melakukan sanitasi HTML di input manapun.** Data tersimpan apa adanya. Proteksi XSS sepenuhnya jadi tanggung jawab **frontend saat render** (React/Vue default aman untuk teks biasa; jangan pernah pakai `dangerouslySetInnerHTML`/`v-html` mentah pada field yang berasal dari user).
- CSV export (`escapeCsvField`) tetap punya proteksi formula-injection sendiri, terpisah dari isu ini.

### Kredit AI
- `requireCredits` memotong credit **sebelum** handler AI dijalankan (supaya tidak ada race condition double-spend — pemotongan pakai transaksi atomik `WHERE credits >= $1`).
- Kalau panggilan AI gagal setelah credit terpotong, backend **otomatis refund** (`refundCredits`) di catch block `/api/chat` dan `/api/chat/stream`.

### Koneksi database
- TLS Postgres memverifikasi sertifikat (`rejectUnauthorized: true`) di luar dev+localhost — mencegah MITM.
- `statement_timeout` (10s) dan `query_timeout` (15s) mencegah 1 query macet menahan koneksi dari pool tanpa batas.

### Admin
- Semua route `/api/admin/*` (kecuali `GET /api/admin/me/verify-email`, yang sengaja publik karena diakses lewat link email) butuh `requireAuth` + `requireAdmin`.
- `requireAdmin` query ulang `is_admin`+`status` langsung dari DB (tidak percaya cache session), jadi demote admin langsung berlaku di request berikutnya.
- Semua aksi admin tercatat di `admin_actions` (audit trail) termasuk IP & user-agent.

---

## 7. Rate Limiting & Proteksi Abuse

| Scope | Limit | Key |
|---|---|---|
| Global default (`/api/*` kecuali admin/news/market) | 30/menit | per IP |
| `/api/auth/*` | 10 / 5 menit | per IP |
| `/api/auth/register` | 5/jam | per IP |
| Chat (`/api/chat`, `/api/chat/stream`) | konfigurasi `RATE_LIMIT_PER_USER_PER_MINUTE` | per user |
| Market (`/api/market/*` non-stream) | 120/menit | per user |
| Market stream | — | max `MARKET_MAX_STREAMS_PER_USER` (default 5) koneksi bersamaan/user |
| Login lockout | 5x gagal per email+IP, atau 30x gagal lintas-IP | 15 menit lock |

Implementasi pakai `express-rate-limit`, **in-memory per instance** — cukup untuk deployment 1 instance. Kalau nanti scale horizontal (>1 instance/container), counter tidak sinkron antar instance sehingga limit efektif terkali jumlah instance; perlu pindah ke store berbasis Redis (`@upstash/ratelimit`, kompatibel langsung dengan client `@upstash/redis` yang sudah dipakai) — belum diimplementasikan.

Proteksi tambahan level koneksi (bukan rate limit, tapi terkait):
- `express.json({ limit: "100kb" })` — cegah payload besar sebagai vektor OOM murah.
- `server.keepAliveTimeout` / `server.headersTimeout` — proteksi slowloris (koneksi lambat/menggantung yang tidak pernah kirim header lengkap). Sengaja **tidak** pasang `server.requestTimeout` global karena bisa memutus paksa koneksi SSE market yang memang didesain long-lived.
- Untuk proteksi DDoS volumetrik (lapis jaringan, sebelum request sampai ke Node sama sekali), sebaiknya pasang reverse proxy/CDN (mis. Cloudflare) di depan origin — ini di luar cakupan kode backend, harus dikonfigurasi di level infrastruktur/DNS.

---

## 8. Background Jobs

Dijalankan otomatis saat `server.js` start (interval, bukan cron eksternal):

| Job | Interval | Fungsi |
|---|---|---|
| Cleanup expired sessions/attempts/tokens/usage records/old news | tiap 1 jam | Housekeeping data yang sudah kadaluarsa |
| Fetch & simpan berita baru | tiap 1 menit | RSS fetcher → `news_articles`, broadcast lewat SSE ke subscriber |
| Heartbeat SSE news | tiap 30 detik | Jaga koneksi `EventSource` tetap hidup |

Semua cleanup juga dijalankan sekali saat startup (`Promise.allSettled`) sebelum interval pertama.

---

## 9. Operasional & Deployment

- **Graceful shutdown:** `SIGTERM`/`SIGINT` menutup server dulu (stop terima koneksi baru), lalu menutup pool Postgres, dengan force-exit setelah 30 detik kalau ada yang menggantung.
- **Health check:** `GET /health` — pasang uptime monitor eksternal (mis. UptimeRobot/Better Stack) yang alert kalau down/lambat.
- **Process manager:** disarankan jalankan lewat PM2 atau container orchestrator dengan memory limit (`--memory` di Docker / `max_memory_restart` di PM2), supaya proses di-restart otomatis kalau memory melonjak/bocor, bukan server jadi unresponsive total.
- **Logging:** Winston, daily rotate file — pastikan volume/disk untuk log dir di-mount persisten di production kalau butuh retensi.
- **Reverse proxy:** kalau di belakang nginx/load balancer, set `TRUST_PROXY_HOPS` sesuai jumlah hop supaya `req.ip`/rate-limit per-IP membaca IP client asli, bukan IP proxy.

---

## 10. Panduan Integrasi Frontend

> **⚠️ Breaking change:** semua endpoint `/api/market/*` wajib login (sebelumnya publik/tanpa auth).

### Autentikasi

```
POST /api/auth/login
Body: { email, password }

200 → { sessionToken, user: { id, email, name, isAdmin } }
403 → { error, accountStatus }        // akun banned/suspended
403 → { error, needsVerification }    // email belum diverifikasi (kalau REQUIRE_EMAIL_VERIFICATION=true)
409 → { error, hasActiveSession: true } // device enforcement aktif & sudah ada session lain di device ini
429 → { error }                       // lockout — lihat bagian Keamanan
```
Simpan `sessionToken` di penyimpanan client. **Tidak ada refresh token** — 401 di request manapun berarti treat sebagai logged-out, redirect ke login.

Kirim token:
```
Authorization: Bearer <sessionToken>
```
**Kecuali** endpoint `EventSource` (browser API tidak bisa kirim custom header) — token dikirim lewat query param `?token=<sessionToken>`.

```
POST /api/auth/register
Body: { email, password (min 8 char), name? }
201 → { message }   // SELALU 201 + pesan generik, walau email sudah terdaftar (anti email-enumeration)
```

```
POST /api/auth/logout
Body: { sessionToken }        // token dikirim di BODY, bukan header

POST /api/auth/logout-all     // header Authorization — revoke semua device
POST /api/auth/logout-by-credentials
Body: { email, password }
```

```
GET /api/auth/google           → redirect ke Google
GET /api/auth/google/callback  → redirect balik ke:
  {FRONTEND_URL}/auth/callback?token=<sessionToken>   (sukses)
  {FRONTEND_URL}/login?error=<slug>                   (gagal)
```

```
GET /api/auth/me   (header auth)
200 → { user: { id, email, name, isAdmin, status, emailVerified } }
```

### Format Error
Semua error non-2xx: `{ error: string, ...detailTambahan? }`. Tidak ada kode error terstruktur — cocokkan lewat status code + isi pesan (Bahasa Indonesia). Field tambahan yang kadang muncul: `accountStatus`, `needsVerification`, `hasActiveSession`.

### Chat
```
POST /api/chat
Body: { taskType?, message, history? }
taskType ∈ [faq, trade_reasoning, risk_narrative, market_insight, quick_summary, classify_signal] (default: faq)
history: max 20 disimpan, tiap content dipotong 4000 char

200 → { reply, modelUsed, latencyMs, usage: { input_tokens, output_tokens } }
402 → { error: "Insufficient credits..." }
```
`trade_reasoning` dan `market_insight` memotong 1 credit sebelum model dipanggil; kalau panggilan gagal (502), credit otomatis di-refund di backend.

```
GET /api/history?limit=50&offset=0&taskType=&startDate=&endDate=
GET /api/export?format=json|csv&taskType=&startDate=&endDate=
```

⚠️ Backend tidak melakukan sanitasi HTML di field manapun (lihat bagian Keamanan) — frontend wajib escape sendiri saat render.

### Usage & Credit
```
GET /api/usage/me?days=30
GET /api/usage/current-month
```

### Messages (inbox internal)
```
GET  /api/messages/inbox?unread=&search=&limit=&offset=
GET  /api/messages/sent
GET  /api/messages/:id
GET  /api/messages/thread/:threadId
POST /api/messages/send            Body: { toEmail, subject, body, replyToMessageId? }
POST /api/messages/:id/read
DELETE /api/messages/:id
GET  /api/messages/preferences/notifications
POST /api/messages/preferences/notifications   Body: { emailEnabled }
```

### Activity log milik sendiri
```
GET /api/me/activity?page=&limit=&action=&from=&to=
```

### Admin (butuh `isAdmin: true`)
```
GET/PATCH /api/admin/me
GET  /api/admin/users, /api/admin/users/:id, /api/admin/users/:id/chats
POST /api/admin/users/:id/reset-password
PUT  /api/admin/users/:id
DELETE /api/admin/users/:id
GET  /api/admin/metrics, /api/admin/analytics, /api/admin/system, /api/admin/logs
GET  /api/admin/actions, /api/admin/actions/meta, /api/admin/actions/export
POST /api/admin/broadcast   Body: { subject, body, recipients: 'all' | string[] }
```

### News
```
GET /api/news?asset=usd|metal|oil|btc&limit=30&offset=0   (header auth)
```

### Endpoint Streaming (Real-time)

Ada 3 mekanisme berbeda:

**A. `POST /api/chat/stream`** — bukan `EventSource`! `POST` dengan `Content-Type: text/event-stream`, tapi browser `EventSource` cuma bisa `GET`. Konsumsi via `fetch()` + `response.body.getReader()` manual. Header `Authorization` dikirim seperti request biasa.
```
data: {"token": "..."}                  // tiap potongan teks
event: done
data: {"modelUsed", "latencyMs", "usage"}
event: error
data: {"error": "..."}
```

**B. `GET /api/news/stream?token=<sessionToken>`** — `EventSource` biasa.
```js
const es = new EventSource(`/api/news/stream?token=${sessionToken}`);
es.addEventListener('news', (e) => { const articles = JSON.parse(e.data); });
```

**C. `GET /api/market/stream?symbol=X,Y&token=<sessionToken>`** — `EventSource`, wajib auth.
```js
const es = new EventSource(`/api/market/stream?symbol=EURUSD,XAUUSD&token=${sessionToken}`);
es.addEventListener('connected', (e) => {});
es.addEventListener('price_update', (e) => {
  const { symbol, price, bid, ask, timestamp } = JSON.parse(e.data);
});
```
- Tanpa `symbol` → semua simbol yang sedang di-track backend dikirim.
- **Cap koneksi bersamaan per user** (default 5) — `429` kalau melebihi. Jangan buka `EventSource` baru tiap ganti timeframe/simbol — reuse 1 koneksi.
- Token invalid/expired → `401` di response awal.

### Market Data
```
GET /api/market/stream              ?token= query, cap koneksi/user
GET /api/market/candles             Histori OHLC — seed chart sekali, bukan polling
GET /api/market/ticker              Snapshot harga terakhir (fallback kalau stream belum connect)
GET /api/market/economic-calendar   Cache 6 jam
GET /api/market/symbols             Daftar simbol didukung
```

### Strategi integrasi KlineChart (real-time, tanpa polling)

1. **Seed sekali** saat chart dibuka/ganti simbol/timeframe:
   ```js
   const res = await fetch(`/api/market/candles?symbol=${symbol}&timeframe=${tf}&count=200`, {
     headers: { Authorization: `Bearer ${token}` }
   });
   const candles = await res.json();
   klineChart.applyNewData(candles);
   ```
2. **Subscribe stream sekali** (context/hook level tinggi, reuse across chart instance):
   ```js
   const es = new EventSource(`/api/market/stream?symbol=${symbol}&token=${token}`);
   es.addEventListener('price_update', (e) => {
     const tick = JSON.parse(e.data);
     updateLastCandleOrPush(tick);
   });
   ```
3. **Update candle terakhir** berdasar `tick.timestamp` dibanding waktu-mulai candle terakhir:
   ```js
   function updateLastCandleOrPush(tick) {
     const last = candles[candles.length - 1];
     const bucketStart = floorToTimeframe(tick.timestamp, timeframeMs);

     if (bucketStart === last.time) {
       last.close = tick.price;
       last.high = Math.max(last.high, tick.price);
       last.low = Math.min(last.low, tick.price);
       klineChart.updateData(last);
     } else {
       const newCandle = { time: bucketStart, open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: 0 };
       candles.push(newCandle);
       klineChart.updateData(newCandle);
     }
   }
   ```
4. **Ganti simbol/timeframe** → tutup `EventSource` lama, ulangi dari langkah 1 (atau subscribe banyak simbol sekaligus via `?symbol=A,B,C`, filter di client).

Backend **tidak** melakukan agregasi OHLC dari tick — logic di atas harus jalan di frontend.

### Hal lain
- **CSV/JSON export** memicu file download langsung — pakai `window.location`/`<a download>`, bukan `fetch()` + parse JSON.
- **`<thinking>` tag** sudah difilter di backend (stream & non-stream) — frontend tidak perlu handle itu.
- **FAQ & classify_signal** di-cache di backend (in-memory) hanya kalau `history` kosong — kirim history kosong untuk pertanyaan FAQ generik untuk manfaat cache.

---

## 11. Known Limitations

- Rate limiter in-memory, belum siap multi-instance (lihat bagian 7).
- Device fingerprint (IP+UA) gampang dipalsukan — bukan proteksi anti-bot yang kuat, cuma lapis tambahan.
- Belum ada CAPTCHA/step-up verification di register & login — device enforcement & lockout adalah satu-satunya proteksi bot saat ini.
- Belum ada agregasi OHLC di backend untuk market data — logic candle-building sepenuhnya di frontend.
- Belum ada proteksi DDoS volumetrik di level jaringan (perlu reverse proxy/CDN eksternal, di luar cakupan kode ini).
