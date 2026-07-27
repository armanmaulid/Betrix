# BETRIX Backend — Panduan Integrasi Frontend

Dokumen ini merangkum semua yang perlu diketahui tim/proyek frontend untuk konek ke backend ini: auth, seluruh endpoint, endpoint streaming, dan strategi integrasi khusus untuk chart real-time.

> **⚠️ Breaking change terbaru:** semua endpoint `/api/market/*` sekarang wajib login (sebelumnya publik/tanpa auth). Lihat bagian [Market Data](#6-market-data--khusus-perubahan-terbaru) untuk detail dan migrasi yang dibutuhkan di frontend.

---

## 1. Stack & Base URL

- Runtime: Node.js/Express (ESM)
- Base URL: `http://localhost:3000` (dev) — semua route di bawah prefix `/api`, kecuali `GET /health`
- Auth: session token custom (bukan JWT) — token random 32-byte, TTL **24 jam tetap, tidak ada refresh token**. Setelah expired, user wajib login ulang.
- CORS: whitelist origin via `ALLOWED_ORIGINS`, `credentials: true` — pastikan frontend fetch/axios pakai `credentials: 'include'` kalau nanti pindah ke cookie-based (saat ini token dikirim manual, bukan cookie).

---

## 2. Autentikasi

### Login
```
POST /api/auth/login
Body: { email, password }

200 → { sessionToken, user: { id, email, name, isAdmin } }
403 → { error, accountStatus }        // akun banned/suspended
403 → { error, needsVerification }    // email belum diverifikasi (kalau REQUIRE_EMAIL_VERIFICATION=true)
409 → { error, hasActiveSession: true } // device enforcement aktif & sudah ada session lain di device ini
429 → { error }                       // lockout, 5x gagal login = lock 15 menit
```
Simpan `sessionToken` di penyimpanan client (localStorage/secure storage). **Tidak ada endpoint refresh** — kalau dapat 401 di request manapun, treat sebagai logged-out dan redirect ke login.

### Kirim token di request
Semua endpoint yang butuh login pakai header:
```
Authorization: Bearer <sessionToken>
```
**Kecuali** endpoint streaming berbasis `EventSource` (browser API `EventSource` tidak bisa kirim custom header) — untuk itu token dikirim lewat **query param** `?token=<sessionToken>`. Lihat bagian [Streaming](#5-endpoint-streaming-real-time).

### Register
```
POST /api/auth/register
Body: { email, password (min 8 char), name? }
201 → { message }   // SELALU 201 + pesan generik, walau email sudah terdaftar (anti email-enumeration)
```
User akan menerima email verifikasi. Login baru bisa sukses penuh setelah verified **kalau** `REQUIRE_EMAIL_VERIFICATION=true` di env backend — tanyakan ke tim backend status flag ini di environment yang dipakai.

### Logout
```
POST /api/auth/logout
Body: { sessionToken }        // ⚠️ token dikirim di BODY, bukan header, untuk endpoint ini
```
```
POST /api/auth/logout-all     // header Authorization — revoke semua device
POST /api/auth/logout-by-credentials
Body: { email, password }     // logout device ini tanpa perlu sessionToken tersimpan
```

### Google OAuth
```
GET /api/auth/google           → redirect ke Google
GET /api/auth/google/callback  → redirect balik ke:
  {FRONTEND_URL}/auth/callback?token=<sessionToken>   (sukses)
  {FRONTEND_URL}/login?error=<slug>                   (gagal — slug: oauth_csrf, google_denied, device_bound, already_logged_in, auth_failed, server_error, account_banned, account_suspended)
```
Frontend perlu route `/auth/callback` yang membaca `?token=` dari URL dan menyimpannya sebagai session.

### Get current user
```
GET /api/auth/me   (header auth)
200 → { user: { id, email, name, isAdmin, status, emailVerified } }
```

### Device enforcement
Kalau `DEVICE_ENFORCEMENT` aktif di backend, 1 device fingerprint (IP+UA) cuma boleh terikat ke 1 akun, dan cuma boleh punya 1 session aktif di device itu. Login dari device yang sama saat masih ada session aktif → `409 hasActiveSession: true`. UI login sebaiknya menampilkan opsi "logout device lain" mengarah ke `logout-by-credentials`.

---

## 3. Format Error

Semua error non-2xx mengembalikan JSON `{ error: string, ...detailTambahan? }`. Tidak ada kode error terstruktur (mis. `ERR_INVALID_INPUT`) — cocokkan lewat status code + isi pesan (dalam Bahasa Indonesia). Field tambahan yang kadang muncul: `accountStatus`, `needsVerification`, `hasActiveSession`.

---

## 4. Endpoint Utama

### Chat (⚠️ path tidak dinamai `/api/chat/...` seperti dugaan — router-nya di-mount langsung di `/api`)

| Method | Path aktual | Keterangan |
|---|---|---|
| POST | `/api/chat` | Chat non-streaming |
| POST | `/api/chat/stream` | Chat streaming (lihat bagian 5) |
| GET | `/api/history` | **Bukan** `/api/chat/history` |
| GET | `/api/export` | **Bukan** `/api/chat/export` |

```
POST /api/chat
Body: { taskType?, message, history? }
taskType ∈ [faq, trade_reasoning, risk_narrative, market_insight, quick_summary, classify_signal] (default: faq)
history: array of { role: 'user'|'assistant', content } — max 20 disimpan, tiap content dipotong 4000 char

200 → { reply, modelUsed, latencyMs, usage: { input_tokens, output_tokens } }
402 → { error: "Insufficient credits..." }   // untuk trade_reasoning & market_insight (lihat catatan credit di bawah)
```

> **Catatan penting soal credit:** `trade_reasoning` dan `market_insight` memotong 1 credit user **sebelum** model AI dipanggil. Kalau panggilan AI gagal (502), credit **saat ini tidak dikembalikan** (known issue di backend, belum ada auto-refund). Kalau UI menampilkan sisa credit, jangan asumsikan otomatis balik walau chat gagal — refresh saldo dari `/api/usage/*` setelah error kalau perlu akurasi.

```
GET /api/history?limit=50&offset=0&taskType=&startDate=&endDate=
200 → { data: [...], pagination: { total, limit, offset, hasMore } }

GET /api/export?format=json|csv&taskType=&startDate=&endDate=
→ file download (Content-Disposition attachment)
```

⚠️ **XSS note:** field `message` dan `content` **tidak** di-sanitize di backend (sengaja, supaya markdown/code yang dikirim ke AI tidak rusak). Kalau frontend render riwayat chat sebagai HTML, **wajib escape sendiri di sisi frontend** sebelum render — jangan pakai `dangerouslySetInnerHTML`/`v-html` mentah pada field `message`/`reply`.

### Usage & Credit
```
GET /api/usage/me?days=30        → ringkasan token usage user
GET /api/usage/current-month     → { requestCount, totalTokens }
```

### Messages (inbox internal, bukan chat AI)
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
GET  /api/admin/actions (audit trail gabungan admin+user), /api/admin/actions/meta, /api/admin/actions/export
POST /api/admin/broadcast   Body: { subject, body, recipients: 'all' | string[] }
```

### News
```
GET /api/news?asset=usd|metal|oil|btc&limit=30&offset=0   (header auth)
```

---

## 5. Endpoint Streaming (Real-time)

Ada **3 jenis mekanisme streaming** berbeda di backend ini — jangan disamaratakan:

### A. `POST /api/chat/stream` — bukan EventSource!
Ini `POST` dengan `Content-Type: text/event-stream` di response, tapi **browser `EventSource` API cuma bisa GET**. Frontend harus konsumsi ini via `fetch()` + baca `response.body.getReader()` manual, parsing baris `data: {...}` sendiri. Header `Authorization: Bearer <token>` dikirim seperti request biasa (bukan query param, karena bukan EventSource).

Event yang dikirim:
```
data: {"token": "..."}                                  // tiap potongan teks
event: done
data: {"modelUsed", "latencyMs", "usage"}                // akhir sukses
event: error
data: {"error": "..."}                                   // akhir gagal
```

### B. `GET /api/news/stream?token=<sessionToken>` — EventSource biasa
```js
const es = new EventSource(`/api/news/stream?token=${sessionToken}`);
es.addEventListener('news', (e) => { const articles = JSON.parse(e.data); });
```
Broadcast artikel baru ke semua client yang subscribe, tiap kali RSS fetcher (jalan tiap 1 menit di background) menemukan artikel baru.

### C. `GET /api/market/stream?symbol=X,Y&token=<sessionToken>` — EventSource, **BARU wajib auth**
```js
const es = new EventSource(`/api/market/stream?symbol=EURUSD,XAUUSD&token=${sessionToken}`);
es.addEventListener('connected', (e) => {});
es.addEventListener('price_update', (e) => {
  const { symbol, price, bid, ask, timestamp } = JSON.parse(e.data);
});
```
- Kalau `symbol` tidak dikirim, semua simbol yang lagi di-track backend akan dikirim.
- **Limit 5 koneksi bersamaan per user** — dapat `429` kalau melebihi. Ini artinya: **jangan buka `EventSource` baru tiap kali user pindah timeframe/simbol** — reuse 1 koneksi, kirim ulang subscribe lewat query param baru (reconnect), atau kelola di satu tempat (context/store global), bukan per-komponen chart.
- Kalau token invalid/expired → `401` di response awal (koneksi tidak akan pernah open).

---

## 6. Market Data — khusus perubahan terbaru

**Sebelumnya:** semua `/api/market/*` publik, tanpa auth, tanpa rate limit.
**Sekarang:** semua endpoint di bawah **wajib** `Authorization: Bearer <token>` (atau `?token=` untuk `/stream`).

| Endpoint | Auth | Catatan |
|---|---|---|
| `GET /api/market/stream` | `?token=` query | Real-time tick. Cap 5 koneksi/user. |
| `GET /api/market/candles` | Header | Histori OHLC — dipakai sekali untuk seed chart, **bukan** untuk polling terus-menerus lagi |
| `GET /api/market/ticker` | Header | Snapshot harga terakhir (fallback kalau stream belum connect) |
| `GET /api/market/economic-calendar` | Header | Cache 6 jam di backend |
| `GET /api/market/symbols` | Header | Daftar simbol yang didukung |

Rate limit khusus market: **120 req/menit per user** (bukan per IP) — lebih longgar dari limiter global (30/menit) karena tadinya `/candles`/`/ticker` di-poll otomatis. Kalau frontend sudah pindah ke strategi streaming di bawah, kebutuhan polling harusnya jauh berkurang sehingga limit ini longgar-aman.

### Strategi integrasi KlineChart (real-time, tanpa polling)

Tujuan: chart candlestick update real-time dari WebSocket MT5 (lewat SSE `/stream`), **News dan Economic Calendar tetap polling seperti biasa** (keduanya sudah punya cache TTL di backend, jadi polling di situ murah).

1. **Seed sekali saat chart dibuka / ganti simbol / ganti timeframe:**
   ```js
   const res = await fetch(`/api/market/candles?symbol=${symbol}&timeframe=${tf}&count=200`, {
     headers: { Authorization: `Bearer ${token}` }
   });
   const candles = await res.json();
   klineChart.applyNewData(candles); // atau API setData sesuai versi klinecharts
   ```
2. **Subscribe stream sekali** (bukan tiap render — taruh di context/hook level tinggi, reuse across chart instance):
   ```js
   const es = new EventSource(`/api/market/stream?symbol=${symbol}&token=${token}`);
   es.addEventListener('price_update', (e) => {
     const tick = JSON.parse(e.data);
     updateLastCandleOrPush(tick);
   });
   ```
3. **Update candle terakhir di client**, berdasar `tick.timestamp` dibanding waktu-mulai candle terakhir yang sudah ada:
   ```js
   function updateLastCandleOrPush(tick) {
     const last = candles[candles.length - 1];
     const bucketStart = floorToTimeframe(tick.timestamp, timeframeMs); // sesuaikan per M1/M5/H1/dst

     if (bucketStart === last.time) {
       // masih dalam candle yang sama → update in place
       last.close = tick.price;
       last.high = Math.max(last.high, tick.price);
       last.low = Math.min(last.low, tick.price);
       klineChart.updateData(last); // API klinecharts untuk update candle terakhir
     } else {
       // periode baru → push candle baru
       const newCandle = { time: bucketStart, open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: 0 };
       candles.push(newCandle);
       klineChart.updateData(newCandle); // klinecharts append otomatis kalau time > candle terakhir
     }
   }
   ```
4. **Ganti simbol/timeframe** → tutup `EventSource` lama, ulangi dari langkah 1 dengan parameter baru (atau — kalau mau lebih efisien — 1 koneksi stream yang subscribe banyak simbol sekaligus via `?symbol=A,B,C`, lalu chart filter sendiri di client mana yang lagi ditampilkan).

Backend **tidak** melakukan agregasi OHLC dari tick — itu semua logic di atas harus jalan di frontend. Kalau ke depan volume tick makin tinggi dan agregasi client-side jadi berat, opsi lain adalah menambah endpoint/event baru di backend yang sudah teragregasi per-candle (belum diimplementasi — kabari tim backend kalau ini dibutuhkan).

---

## 7. Rate Limit Ringkasan

| Scope | Limit | Key |
|---|---|---|
| Global default (`/api/*` kecuali admin/news/market) | 30/menit | per IP |
| `/api/auth/*` | 10 / 5 menit | per IP |
| `/api/auth/register` | 5/jam | per IP |
| Chat (`/api/chat`, `/api/chat/stream`) | 30/menit | per user |
| Market (`/api/market/*` non-stream) | 120/menit | per user |
| Market stream | — | max 5 koneksi bersamaan/user |
| Login lockout | 5x gagal | 15 menit lock per email+IP |

Response `429` selalu `{ error }` — tampilkan pesan apa adanya ke user, retry-after tidak disediakan eksplisit di body (cek header standar `RateLimit-*` kalau perlu, `standardHeaders: true` aktif di semua limiter).

---

## 8. Hal Lain yang Perlu Diketahui Frontend

- **Tidak ada refresh token.** Session mati keras setelah 24 jam sejak dibuat (bukan sliding/rolling). Siapkan UX untuk re-login yang mulus (redirect balik ke halaman semula setelah login ulang).
- **CSV/JSON export** (`/api/chat/export`, `/api/admin/users/export`, `/api/admin/actions/export`) memicu file download langsung dari response — pakai `window.location` atau `<a download>`, bukan `fetch()` + parse JSON.
- **`<thinking>` tag** sudah difilter di backend (baik mode stream maupun non-stream) — frontend tidak perlu handle itu, teks yang diterima sudah bersih.
- **FAQ & classify_signal** di-cache di backend (7 hari, in-memory) **hanya kalau `history` kosong/tidak dikirim** — kirim history kosong untuk pertanyaan FAQ generik supaya dapat manfaat cache (lebih cepat, `latencyMs: 0`).
