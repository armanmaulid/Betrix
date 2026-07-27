# EA Console — Client Frontend

Frontend client-facing untuk trading assistant: chart candlestick real-time (data dari MT5), panel strategi AI, hasil sinyal (entry/SL/TP + alternatif), news feed, dan economic calendar.

**Stack:** React + TypeScript + Vite + Tailwind + KLineCharts + MT5 Bridge

## Requirement

- Node.js 18+ dan npm
- **Windows** (untuk jalanin `mt5-bridge` — lihat `mt5-bridge/README.md` kenapa ini strict Windows-only)
- MetaTrader 5 terminal ter-install, running, login ke akun (demo oke)
- Python 3.9+ (untuk `mt5-bridge`)

## Setup & Run

### 1. Start MT5 Bridge (WAJIB duluan, biar chart ada datanya)

```bash
cd mt5-bridge
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Pastikan MT5 terminal sudah terbuka & login **sebelum** start ini. Detail lengkap di `mt5-bridge/README.md`.

### 2. Setup & jalanin frontend

```bash
# Di terminal terpisah, dari root Frontend - Client
npm install

# Setup environment variables
cp .env.example .env.local
# Edit .env.local:
# - VITE_API_BASE_URL: URL backend API (default http://localhost:3000/api)
# - VITE_MT5_BRIDGE_URL: default http://localhost:8000 (sesuaikan jika perlu)

npm run dev
```

Buka browser ke `http://localhost:5173`.

**Kalau ada error:**
- Backend belum jalan → News feed & auth tidak akan bekerja
- `mt5-bridge` belum jalan / MT5 terminal belum login → chart nunjukkin pesan error
- `CalendarExporter.mq5` belum di-attach ke chart → Economic Calendar nunjukkin error 404 dengan instruksi setup

## Build Production

```bash
npm run build      # hasil ada di folder dist/
npm run preview    # preview hasil build production secara lokal
```

## Type Check

```bash
npm run typecheck
```

Jalanin ini sebelum deploy untuk catch TypeScript errors.

## Fitur & Halaman

### Authentication
- **Login** (`/login`) — session-based auth dengan backend
- **Register** (`/register`) — buat akun baru
- **Protected routes** — redirect ke login jika belum authenticated

### Dashboard (`/`)
- **Overview** — watchlist, market summary, recent signals
- **Live ticker strip** — multi-symbol price updates
- **Quick access** ke fitur utama

### Analyze (`/analyze`)
- **Chart candlestick real-time** — data langsung dari MT5 via bridge
- **Strategy panel** — pilih strategi, mode, timeframe
- **AI signal generation** — entry/SL/TP + alternatif
- **News feed** — financial news dari backend (RSS aggregator untuk USD, metal, oil, BTC)
- **Economic calendar** — MT5 calendar via CalendarExporter.mq5

## Struktur Folder

```
mt5-bridge/                           # Python — jembatan ke MT5 terminal (lihat README-nya sendiri)
├── main.py
├── requirements.txt
├── CalendarExporter.mq5
└── README.md

src/
├── main.tsx                          # entry point
├── App.tsx                           # routing & AuthProvider wrapper
├── index.css                         # design tokens (charcoal-amber theme)
├── vite-env.d.ts
├── api/
│   ├── authClient.ts                 # axios client dengan auth interceptor
│   └── mt5Bridge.ts                  # MT5 bridge: candles + calendar
├── context/
│   └── AuthContext.tsx               # session management, user state
├── pages/
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx
│   ├── DashboardPage.tsx
│   └── AnalyzePage.tsx               # main analysis page dengan chart
├── components/
│   ├── auth/
│   │   ├── AuthLayout.tsx
│   │   └── ProtectedRoute.tsx
│   ├── layout/
│   │   ├── SideNavRail.tsx
│   │   ├── TopBar.tsx
│   │   ├── StatusBar.tsx
│   │   ├── TerminalShell.tsx
│   │   └── WatchlistPanel.tsx
│   └── analysis/
│       ├── TickerStrip.tsx           # live price strip (signature element)
│       ├── KLineChartWidget.tsx      # candlestick chart (klinecharts)
│       ├── StrategyPanel.tsx         # strategy selector + controls
│       ├── SignalResultCard.tsx      # entry/SL/TP display
│       ├── NewsFeed.tsx              # financial news dari backend RSS
│       ├── EconomicCalendar.tsx      # MT5 calendar
│       └── TradingViewWidget.tsx     # TradingView embed (optional)
├── hooks/
│   └── useTickerPrices.ts            # price polling hook
└── lib/
    └── tradingViewSymbols.ts         # symbol mapping utils
```

## 📈 Chart — MT5 Bridge (bukan TradingView widget, bukan API pihak ketiga)

`KLineChartWidget.tsx` render candle pakai library
[klinecharts](https://github.com/klinecharts/KLineChart) (open-source,
gratis), datanya ditarik dari **`mt5-bridge`** — server Python lokal yang
baca langsung dari MT5 terminal kamu. Lihat `mt5-bridge/README.md` buat
detail setup.

**Kenapa nggak pakai API data pihak ketiga buat chart** (cerita 2 dead-end
yang kejadian beneran pas riset ini, biar nggak keulang):
1. **Alpha Vantage** free tier cuma **25 request/hari** — nggak layak buat
   chart yang butuh reload tiap ganti symbol/timeframe.
2. **Finnhub** — banyak blog bilang forex "included in free tier", tapi pas
   dites langsung (`curl` ke `/forex/candle`), balikin
   `"You don't have access to this resource"`. Cuma endpoint metadata
   (`/forex/symbol`) yang beneran gratis, bukan data candle-nya.

Karena produk ini emang based di MT5, data paling reliable & genuinely
gratis ya dari broker feed MT5 sendiri — makanya `mt5-bridge` ada.

**Symbol format berubah** dari versi TradingView sebelumnya: dulu
`"OANDA:EURUSD"`, sekarang **plain** `"EURUSD"` (format MT5 Market Watch).
Broker kamu mungkin pakai suffix (`EURUSD.a`, `EURUSDm`) — cek
`mt5-bridge/README.md` kalau simbol 404.

**KLineChart API note**: pakai versi 10, yang API-nya `setDataLoader` /
`getBars` (pull-based callback) — BUKAN `applyNewData` yang dipakai di versi
9 dan sebelumnya (banyak tutorial online masih nunjukkin API lama ini,
jangan kecoh). Udah di-type-check terhadap type declaration asli sebelum
ditulis, bukan cuma nebak dari dokumentasi.

## 📰 News Feed — Backend RSS Aggregator

`NewsFeed.tsx` fetch news dari backend `/api/news` yang aggregate RSS feed dari berbagai sumber untuk asset USD, metal (gold), oil, dan BTC. Auto-polling tiap 30 detik untuk update realtime, atau bisa pakai EventSource (`/api/news/stream`) setelah ada login untuk SSE streaming.

**Asset filtering**: News di-tag berdasarkan asset relevance, bisa filter per kategori (USD/GOLD/OIL/BTC).

## 📅 Economic Calendar — MT5 (via CalendarExporter.mq5)

`EconomicCalendar.tsx` sekarang pakai **MT5 sendiri** (bukan TradingView
widget, bukan Alpha Vantage). Perjalanannya kalau mau tau sejarahnya:

1. **TradingView widget** — gratis, gampang, tapi cuma iframe visual, nggak
   bisa dibaca AI/backend kalau nanti dibutuhin buat reasoning.
2. **Alpha Vantage** — dicoba, ternyata cuma economic *indicators* (nilai
   terakhir yang udah dirilis, US-focused), bukan calendar forward-looking
   beneran.
3. **MT5 (final)** — ternyata MT5 terminal punya Economic Calendar bawaan
   (`CalendarValueHistory()` dkk, 21+ negara, genuinely forward-looking),
   tapi cuma bisa diakses dari MQL5 di dalam terminal — makanya ada EA
   `CalendarExporter.mq5` yang nulis data itu ke JSON, dibaca `mt5-bridge`
   lewat endpoint `/economic-calendar`.

**Setup wajib**: EA `CalendarExporter.mq5` harus di-attach ke 1 chart di
terminal biar data-nya kebuat. Detail lengkap di `mt5-bridge/README.md`
bagian "Setup Economic Calendar".

## ⚠️ Yang Masih Mock / Belum Terhubung Penuh

1. **AI Signal Generation di `AnalyzePage.tsx`** — masih mock dengan delay 1.5 detik. Ganti dengan panggilan API backend beneran begitu endpoint AI-nya siap.

2. **Chart belum bisa gambar entry/SL/TP** — `KLineChartWidget` baru render candle saja. `klinecharts` punya `chart.createOverlay(...)` untuk gambar garis/annotation, tapi belum di-wire ke `SignalResult`.

3. **`mt5-bridge` cuma jalan di 1 PC lokal** — bukan server production, nggak ada auth. Lihat warning di `mt5-bridge/README.md` sebelum mikirin production deployment.

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** — fast dev server & build
- **React Router v7** — client-side routing
- **Tailwind CSS** — utility-first styling
- **KLineCharts** — candlestick chart library
- **Lucide React** — icon set
- **Axios** — HTTP client dengan auth interceptor
- **MT5 Bridge** — Python FastAPI server untuk data MT5

## Langkah Selanjutnya

- **Gambar entry/SL/TP di chart** — implementasi `chart.createOverlay()` untuk visualisasi signal
- **Real-time WebSocket** — live candle updates via WebSocket (sekarang masih pull-based)
- **`mt5-bridge` ke production server** — pindah ke VPS dengan MT5 running 24/7, tambah auth
- **Credit system** — integrasi dengan backend untuk tracking & charging AI requests
- **Historical signals** — halaman untuk lihat riwayat signal yang pernah di-generate
- **Portfolio tracking** — track performance dari signal yang diambil
- **Notifications** — alert untuk signal baru, news, calendar events

## Catatan Desain

- Token warna (`--bg`, `--accent`, dll di `index.css`) **sama persis** dengan admin console untuk konsistensi brand
- Default tema adalah **dark** (`class="dark"` di `<html>`)
- `KLineChartWidget` style warna di-hardcode (`#4fbf8b`/`#e85d5d`) karena `klinecharts` butuh hex string langsung. Kalau nanti ada toggle light/dark, perlu adjust manual
- Ticker strip adalah signature visual element — terinspirasi terminal trading dengan palet charcoal-amber

---

**Terakhir diupdate:** 2026-07-24
