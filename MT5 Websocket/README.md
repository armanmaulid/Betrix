# MT5 Bridge

Expert Advisor (EA) MetaTrader 5 yang mengekspos data trading lewat **HTTP REST API** dan **WebSocket streaming**, sehingga backend eksternal (Node.js, Python, dll) bisa baca quote, historical data, economic calendar, symbol list, dan langganan stream real-time (price / OHLC / market book / calendar) tanpa perlu bikin koneksi native ke MetaTrader.

## Fitur

- **REST (one-shot query)**
  - `GET /v1/quote` — bid/ask/spread terkini untuk satu simbol
  - `GET /v1/history/prices` — historical OHLC bar untuk range tanggal tertentu
  - `GET /v1/calendar` — economic calendar (range tanggal eksplisit atau shorthand `period`)
  - `GET /v1/symbol/list` — semua simbol yang tersedia di broker
- **WebSocket (streaming)**
  - Live price update (bid/ask/spread berubah)
  - Live OHLC bar update (bar baru terbentuk)
  - Live market book / DOM (order book berubah)
  - Live economic calendar update (actual/forecast value berubah)
- Tracking dikonfigurasi lewat `POST /v1/track/*`, lalu MT5 push data ke semua client WebSocket yang terhubung.

## Arsitektur

```
Backend kamu ──HTTP POST /v1/track/*────▶ ┐
                                          │
Backend kamu ──WS connect────────────────▶├─▶ SocketBridgeEA.mq5 (MT5)
                                          │      ├─ CommandHandler.mqh  (routing HTTP)
Backend kamu ◀──WS push (streaming)───────┘      ├─ CommandCore.mqh     (query one-shot)
                                                 └─ Data.mqh            (state + streaming)
```

Satu EA = satu server (HTTP + WebSocket di port yang sama). Tidak ada proses terpisah — semuanya jalan di dalam `OnTimer()` MT5.

## ⚠️ Penting: konfigurasi tracking bersifat GLOBAL, bukan per-client

Request `POST /v1/track/prices` (atau `/ohlc`, `/mbook`, `/calendar`) datang lewat **koneksi HTTP pendek yang langsung ditutup setelah dibalas** — ini koneksi yang **berbeda** dari koneksi WebSocket tempat data di-stream. Protokolnya tidak punya konsep session/client-id, jadi:

- Config yang di-set lewat `POST /v1/track/*` berlaku untuk **semua client WebSocket** yang sedang/nanti terhubung — bukan cuma yang mengirim request itu.
- Semua client WebSocket menerima **stream yang sama persis** (broadcast), bukan stream yang di-personalisasi per koneksi.
- Kalau backend kamu adalah satu-satunya consumer, ini tidak masalah. Kalau kamu punya beberapa consumer dengan kebutuhan symbol/timeframe yang **berbeda**, kamu perlu jalankan **instance MT5 terpisah** per kebutuhan (bukan reuse satu EA untuk banyak subscription berbeda), atau extend protokol dengan client-id (lihat bagian [Batasan](#batasan-known-limitations)).

## Instalasi

1. Copy semua file (`*.mqh`, `SocketBridgeEA.mq5`) ke folder `MQL5/Experts/` (atau subfolder) di data directory MT5 kamu.
2. Buka `SocketBridgeEA.mq5` di MetaEditor, compile (F7). Pastikan tidak ada error.
3. Di MT5 Terminal: **Tools → Options → Expert Advisors** → centang:
   - "Allow WebRequest for listed URL" (kalau diperlukan untuk versi lanjutan)
   - "Allow DLL imports" (**wajib** — EA ini pakai `Ws2_32.dll` dan `kernel32.dll` untuk socket)
4. Drag `SocketBridgeEA` ke chart mana saja. Chart itu harus tetap terbuka & AutoTrading harus aktif (EA jalan lewat `OnTimer`, bukan `OnTick`, jadi tidak perlu ada tick masuk terus-menerus, tapi terminal/chart-nya harus tetap hidup).
5. Default port: **8890** (`#define HTTP_PORT 8890` di `SocketBridgeEA.mq5`, ubah sebelum compile kalau perlu).
6. **Untuk `GET /v1/calendar` dan `POST /v1/track/calendar`:** aktifkan calendar events di terminal (Tools → Options → Server, atau otomatis kalau ada Market Watch symbol dengan calendar terhubung) — kalau tidak, `CalendarValueHistory`/`CalendarValueLast` akan mengembalikan array kosong.

## API Reference

### `GET /v1/quote?symbol=EURUSD`
```json
{ "symbol": "EURUSD", "ask": 1.0851, "bid": 1.0849, "spread": 20, "digits": 5, "volume": 12, "time": "2026-08-09T10:15:23.412Z" }
```

### `GET /v1/history/prices?symbol=EURUSD&time_frame=H1&from_date=2026-08-01&to_date=2026-08-08`
`time_frame`: `M1 M5 M15 M30 H1 H4 D1 W1 MN1`. Tanggal format `YYYY-MM-DD` atau `YYYY-MM-DDTHH:MM:SS`.
```json
{ "from_date": "...", "to_date": "...", "data": [ { "time": "...", "open": 1.085, "high": 1.086, "low": 1.084, "close": 1.0855, "volume": 1523 } ] }
```

### `GET /v1/calendar?period=today` atau `?from_date=...&to_date=...`
`period` (opsional, shorthand): `today | yesterday | tomorrow | this_week | last_week | next_week | this_month | last_month | next_month`. Kalau `period` dikirim, `from_date`/`to_date` diabaikan.

### `GET /v1/symbol/list`
Daftar semua simbol broker (bukan cuma yang ada di Market Watch). Bisa jadi payload besar di broker dengan ribuan instrumen — lihat pola sync di bagian [Cara Integrasi ke Backend](#cara-integrasi-ke-backend) biar gak perlu ambil ulang tiap kali connect.

### `GET /v1/symbol/count`
```json
{ "count": 20000 }
```
Fingerprint murah buat cek "apa daftar simbol berubah" tanpa perlu narik seluruh list. Cocok dipanggil tiap kali backend connect ke EA, sebelum decide perlu `GET /v1/symbol/list` atau tidak.

### `POST /v1/track/prices`
```json
{ "symbols": ["EURUSD", "GBPUSD"] }
```
Kirim `symbols: []` (array kosong) untuk **stop** tracking price.

### `POST /v1/track/ohlc`
```json
{ "ohlc": [ { "symbol": "EURUSD", "time_frame": "M5", "depth": 3 } ] }
```
`depth` harus 1–10. Response berisi `accepted` dan `rejected` (dengan alasan) per item.

### `POST /v1/track/mbook`
```json
{ "symbols": ["EURUSD"] }
```

### `POST /v1/track/calendar`
```json
{ "country": "US", "currency": "" }
```
Kedua field opsional — kosong berarti "semua". Kirim keduanya kosong (`{}`) untuk stop tracking calendar.

## WebSocket Streaming

Connect ke `ws://<host>:8890` (handshake WebSocket standar). Setelah connect, server akan push pesan JSON berbentuk:

| `type` | Trigger |
|---|---|
| `price_update` | Bid/ask salah satu symbol yang di-track berubah |
| `ohlc_update` | Bar baru terbentuk untuk salah satu request OHLC yang di-track |
| `track_mbook` | Order book / DOM berubah untuk salah satu symbol yang di-track |
| `calendar_update` | Ada event calendar yang actual/forecast/previous-nya berubah |

Contoh `price_update`:
```json
{ "type": "price_update", "timestamp": 1754732345, "symbol": "EURUSD", "volume": 12, "bid": 1.0849, "ask": 1.0851, "spread": 20, "digits": 5 }
```

## Cara Integrasi ke Backend

### Node.js
```js
import WebSocket from "ws";

// 1. Set apa yang mau di-track (sekali di awal, atau kapan pun mau ganti)
await fetch("http://mt5-host:8890/v1/track/prices", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ symbols: ["EURUSD", "XAUUSD"] }),
});

// 2. Dengerin stream-nya
const ws = new WebSocket("ws://mt5-host:8890");
ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  switch (msg.type) {
    case "price_update":
      console.log(msg.symbol, msg.bid, msg.ask);
      break;
    case "ohlc_update":
    case "track_mbook":
    case "calendar_update":
      // handle sesuai kebutuhan
      break;
  }
});
ws.on("close", () => {
  // reconnect + POST /v1/track/* ulang kalau perlu (state tracking hidup selama EA jalan,
  // jadi reconnect saja biasanya cukup, config tidak hilang)
});
```

### Python
```python
import json
import requests
import websocket

requests.post(
    "http://mt5-host:8890/v1/track/prices",
    json={"symbols": ["EURUSD", "XAUUSD"]},
)

def on_message(ws, message):
    msg = json.loads(message)
    if msg["type"] == "price_update":
        print(msg["symbol"], msg["bid"], msg["ask"])

ws = websocket.WebSocketApp("ws://mt5-host:8890", on_message=on_message)
ws.run_forever()
```

### Pola sync symbol list (hindari re-transfer besar tiap connect)

Pola yang direkomendasikan buat backend yang nyimpen symbol list ke database (mis. PostgreSQL): pakai `GET /v1/symbol/count` sebagai fingerprint murah sebelum decide perlu narik full list atau tidak.

```
backend connect ke EA
  │
  ▼
GET /v1/symbol/count  →  { "count": N }
  │
  ├─ belum pernah sync sebelumnya  ──▶ GET /v1/symbol/list, simpan semua + simpan N
  │
  ├─ N sama dengan yang tersimpan  ──▶ skip, gak perlu narik ulang
  │
  └─ N beda dengan yang tersimpan  ──▶ GET /v1/symbol/list ulang, replace + update N
```

⚠️ **Catatan akurasi:** `count` cuma fingerprint jumlah, bukan checksum isi. Kalau broker kebetulan hapus 1 symbol dan nambah 1 symbol lain di waktu yang sama, jumlahnya tetap sama padahal isinya berubah — backend bisa salah kira "tidak ada perubahan". Risikonya kecil untuk kebanyakan kasus, tapi kalau butuh akurasi penuh, upgrade ke pembanding hash isi list (pola yang sama seperti hash-based change detection yang dipakai di market book streaming) alih-alih count saja.

**Catatan koneksi:** kalau WebSocket putus, cukup reconnect ke `ws://host:8890` — kamu **tidak perlu** POST ulang ke `/v1/track/*`, karena config tracking disimpan di EA (bukan per-koneksi) dan tetap aktif selama EA-nya jalan. POST ulang cuma perlu kalau memang mau **mengubah** daftar symbol/timeframe/filter.

## Batasan (Known Limitations)

- **Broadcast-only, bukan multi-tenant**: semua client WebSocket dapat stream & config yang sama (lihat bagian ⚠️ di atas). Backend perlu tahu ini kalau mau attach beberapa consumer sekaligus dengan kebutuhan berbeda.
- **Tidak ada autentikasi** di level protokol — siapa pun yang bisa reach `host:8890` bisa baca data & ubah config tracking. Amankan lewat firewall / VPN / reverse proxy, jangan expose port ini langsung ke internet publik.
- **Max payload WebSocket 65535 byte** per frame (dibatasi oleh format frame yang dipakai — lihat `WebSocketLib.mqh`). Kalau depth OHLC atau symbol list sangat besar, payload bisa kepotong ditolak (`SendWebSocketTextFrame` akan gagal & log error, bukan corrupt data).
- **EA harus tetap attached & terminal harus tetap hidup.** Kalau MT5 restart / EA di-remove dari chart, semua koneksi & config tracking hilang (perlu reconnect + re-POST config).
- **`GET /v1/calendar` dan `POST /v1/track/calendar`** bergantung pada data economic calendar dari MT5/broker — kalau broker tidak menyediakan feed calendar, endpoint ini akan selalu kosong.

## Changelog (perbaikan terakhir)

- **Data.mqh** — deteksi perubahan (price/OHLC/market book/calendar) sekarang dijalankan **sekali per tick**, lalu hasilnya di-broadcast ke semua client WebSocket yang terhubung (`CData::BroadcastData`). Sebelumnya, deteksi dijalankan ulang per-client di dalam loop, sehingga state "sudah terkirim" ikut ter-update oleh client pertama — client kedua dst di tick yang sama jadi tidak dapat update tersebut (untuk calendar, event-nya hilang permanen karena `change_id` dari `CalendarValueLast` adalah cursor yang tidak bisa di-replay).
- **Data.mqh** — `SendCurrentMbook()` sekarang pakai `TimeTradeServer()`, bukan `TimeCurrent()`, untuk timestamp per-item order book (konsisten dengan bagian lain yang sudah pakai `TimeTradeServer()`; `TimeCurrent()` bisa stale saat market tutup).
- **WebSocketLib.mqh** — `SendWebSocketTextFrame()` sebelumnya pakai buffer tetap `uchar frame[2048]` padahal header frame-nya sendiri mengklaim dukungan payload sampai 65535 byte — payload JSON di atas ~2044 byte berpotensi menulis di luar batas array. Sekarang buffer di-alokasi dinamis sesuai ukuran payload.
- **HttpLib.mqh** — `SendHttpResponse()` sebelumnya manggil `send()` sekali dan mengabaikan return value-nya. Di socket non-blocking (dipakai semua client di project ini), `send()` tidak menjamin seluruh buffer terkirim dalam satu panggilan — untuk response besar (mis. `GET /v1/symbol/list` di broker dengan puluhan ribu instrumen, bisa beberapa MB), sisa byte yang tidak terkirim akan hilang diam-diam dan client menerima body yang terpotong. Sekarang dikirim lewat `SendAll()` yang loop sampai semua byte benar-benar terkirim (dengan timeout 5 detik supaya satu client yang macet tidak membekukan seluruh EA).
- **CommandCore.mqh / CommandHandler.mqh** — tambah endpoint `GET /v1/symbol/count`, fingerprint murah (cuma jumlah simbol) buat backend cek perlu sync ulang symbol list atau tidak tanpa narik seluruh payload tiap kali connect.
