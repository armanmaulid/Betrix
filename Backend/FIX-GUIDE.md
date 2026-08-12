# Fix: MT5 Bridge tracking config tidak ke-restore setelah EA restart

## Aturan main (WAJIB dibaca sebelum eksekusi apa pun)

Dokumen ini bersifat **preskriptif, bukan diskusi**. Setiap blok kode di bawah
sudah final dan sudah dicocokkan persis dengan isi file saat ini di repo.

1. **Jangan improvisasi.** Jangan mengubah nama variabel, urutan field, gaya
   penulisan, atau menambah fitur di luar yang diinstruksikan di sini,
   walaupun menurutmu ada cara yang "lebih baik".
2. **Jangan berdebat dengan instruksi ini.** Kalau ada blok `FIND` yang tidak
   ketemu persis di file target, JANGAN menebak lokasi lain atau menulis
   ulang dari nol. STOP dan laporkan baris/file yang tidak cocok, karena itu
   artinya file sudah berubah sejak dokumen ini ditulis.
3. **Eksekusi berurutan sesuai nomor file (1 → 2 → 3).** File 3 bergantung
   pada tipe yang ditambahkan di File 1, dan pada method baru yang ditambah
   di File 2.
4. Semua path di bawah relatif terhadap `Backend/src-new/`.
5. Setelah selesai, jalankan checklist verifikasi di bagian paling bawah.
   Jangan anggap tugas selesai sebelum checklist itu lolos semua.

---

## Konteks singkat (untuk pemahaman, bukan instruksi eksekusi)

EA MT5 Bridge broadcast tracking config (price/ohlc/mbook/calendar) secara
global ke semua WebSocket client. Kalau EA/terminal MT5 restart, config itu
hilang di sisi EA, dan sebelumnya tidak ada mekanisme di backend Node.js yang
otomatis re-apply config via `POST /v1/track/*`. Backend jalan normal secara
log, tapi diam-diam berhenti nerima data.

Fix ini menambahkan dua lapis:
- **Layer 1 (reaktif):** tiap kali WebSocket ke EA berhasil (re)connect,
  backend otomatis re-POST semua tracking config sesuai `.env`.
- **Layer 2 (proaktif):** EA broadcast pesan `tracking_status` setiap ~5
  detik berisi flag tracking yang aktif + uptime. Backend bandingkan pesan
  ini dengan apa yang seharusnya aktif menurut `.env`, dan resubscribe kalau
  beda. Kalau pesan ini berhenti datang (EA mati non-graceful, tidak ada
  `onclose`), backend paksa reconnect setelah 15 detik tanpa sinyal.

Perubahan di sisi EA (`Data.mqh`, `SocketBridgeEA.mq5`) sudah dikerjakan
terpisah dan tidak perlu disentuh lagi — dokumen ini KHUSUS backend.

---

## File 1 — `application/ports/IBrokerProvider.ts`

### Tujuan
Tambah kontrak tipe untuk 2 callback baru: `onReconnect` dan
`onTrackingStatus`, plus interface `TrackingStatus`.

### FIND (persis, termasuk indentasi)
```ts
export interface BrokerCallbacks {
  onPriceTick?: (tick: PriceTick) => void;
  onOHLCUpdate?: (update: OHLCUpdate) => void;
  onMarketBookUpdate?: (update: MarketBookUpdate) => void;
  onCalendarUpdate?: (update: CalendarUpdate) => void;
}
```

### REPLACE WITH
```ts
export interface TrackingStatus {
  price: boolean;
  ohlc: boolean;
  mbook: boolean;
  calendar: boolean;
  uptimeSec: number;
}

export interface BrokerCallbacks {
  onPriceTick?: (tick: PriceTick) => void;
  onOHLCUpdate?: (update: OHLCUpdate) => void;
  onMarketBookUpdate?: (update: MarketBookUpdate) => void;
  onCalendarUpdate?: (update: CalendarUpdate) => void;
  onReconnect?: () => void;
  onTrackingStatus?: (status: TrackingStatus) => void;
}
```

### Setelah diterapkan, file lengkapnya harus terlihat seperti ini
(gunakan ini untuk verifikasi visual, bukan untuk copy-paste ulang seluruh
file — cukup terapkan FIND/REPLACE di atas):
```ts
import { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";

export interface PriceTick {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  digits: number;
  volume: number;
  timestamp: number;
}

export interface OHLCUpdate {
  symbol: string;
  timeframe: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  prev_close: number;
}

export interface MarketBookUpdate {
  symbol: string;
  bids: Array<{ price: number; volume: number }>;
  asks: Array<{ price: number; volume: number }>;
}

export interface CalendarUpdate {
  event_id: number;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

export interface TrackingStatus {
  price: boolean;
  ohlc: boolean;
  mbook: boolean;
  calendar: boolean;
  uptimeSec: number;
}

export interface BrokerCallbacks {
  onPriceTick?: (tick: PriceTick) => void;
  onOHLCUpdate?: (update: OHLCUpdate) => void;
  onMarketBookUpdate?: (update: MarketBookUpdate) => void;
  onCalendarUpdate?: (update: CalendarUpdate) => void;
  onReconnect?: () => void;
  onTrackingStatus?: (status: TrackingStatus) => void;
}

export interface IBrokerProvider {
  connect(): Promise<void>;
  disconnect(): void;
  setCallbacks(callbacks: BrokerCallbacks): void;

  trackPrices(symbols: string[]): Promise<void>;
  trackOHLC(requests: Array<{ symbol: string; timeframe: string; depth: number }>): Promise<void>;
  trackMarketBook(symbols: string[]): Promise<void>;
  trackCalendar(country?: string, currency?: string): Promise<void>;

  fetchSymbolCount(): Promise<number>;
  fetchSymbols(): Promise<BrokerSymbol[]>;
  fetchCalendar(period?: string): Promise<any[]>;
}
```

---

## File 2 — `data/external/Mt5WebsocketClient.ts`

### Tujuan
- Hapus `subscribeToSymbols()` (dead code — EA tidak pernah membaca pesan
  masuk dari WS client setelah handshake).
- Tambah watchdog staleness untuk `tracking_status`.
- Tambah handler `case "tracking_status"` di `handleMessage()`.
- Panggil `callbacks.onReconnect?.()` di `onopen`, bukan `subscribeToSymbols()`.

Terapkan 5 perubahan berikut secara berurutan pada file yang sama.

### Perubahan 2.1 — tambah field watchdog di deklarasi class

**FIND:**
```ts
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_DELAY = 5000;

  private callbacks: BrokerCallbacks = {};
```

**REPLACE WITH:**
```ts
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_DELAY = 5000;

  // Status heartbeat watchdog. EA broadcasts a "tracking_status" message
  // every ~5s (see Data.mqh::SendTrackingStatus). If none arrives within
  // STATUS_STALE_TIMEOUT_MS, the EA is assumed dead even though the TCP
  // socket may still look open (covers non-graceful EA death: crash, kill,
  // terminal shutdown, where onclose can be delayed or never fire).
  private statusWatchdog: NodeJS.Timeout | null = null;
  private lastTrackingStatusAt = 0;
  private readonly STATUS_STALE_TIMEOUT_MS = 15000;
  private readonly STATUS_CHECK_INTERVAL_MS = 5000;

  private callbacks: BrokerCallbacks = {};
```

### Perubahan 2.2 — ganti isi `onopen`, tambah `stopStatusWatchdog()` di `onclose`

**FIND:**
```ts
        this.ws.onopen = () => {
          logger.info("MT5 WebSocket connected", { context: "MT5" });
          this.reconnectAttempts = 0;
          this.subscribeToSymbols();
          resolve();
        };

        this.ws.onmessage = (event) => this.handleMessage(event.data);
        
        this.ws.onclose = () => {
          logger.warn("MT5 WebSocket disconnected", { context: "MT5" });
          this.scheduleReconnect();
        };
```

**REPLACE WITH:**
```ts
        this.ws.onopen = () => {
          logger.info("MT5 WebSocket connected", { context: "MT5" });
          this.reconnectAttempts = 0;
          this.startStatusWatchdog();
          this.callbacks.onReconnect?.();
          resolve();
        };

        this.ws.onmessage = (event) => this.handleMessage(event.data);
        
        this.ws.onclose = () => {
          logger.warn("MT5 WebSocket disconnected", { context: "MT5" });
          this.stopStatusWatchdog();
          this.scheduleReconnect();
        };
```

### Perubahan 2.3 — hapus `subscribeToSymbols()`, tambah watchdog methods

**FIND:**
```ts
  private subscribeToSymbols(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ action: "subscribe", symbols: [] }));
  }
```

**REPLACE WITH:**
```ts
  private startStatusWatchdog(): void {
    this.stopStatusWatchdog();
    this.lastTrackingStatusAt = Date.now(); // grace period sampai status pertama datang
    this.statusWatchdog = setInterval(() => {
      const staleFor = Date.now() - this.lastTrackingStatusAt;
      if (staleFor > this.STATUS_STALE_TIMEOUT_MS) {
        logger.warn(`No tracking_status from MT5 EA in ${staleFor}ms - assuming EA dead, forcing reconnect`, { context: "MT5" });
        this.ws?.close();
      }
    }, this.STATUS_CHECK_INTERVAL_MS);
  }

  private stopStatusWatchdog(): void {
    if (this.statusWatchdog) {
      clearInterval(this.statusWatchdog);
      this.statusWatchdog = null;
    }
  }
```

**Catatan:** JANGAN menyisakan `subscribeToSymbols()` di file. Method ini
harus hilang total setelah perubahan ini. Kalau ada pemanggil lain ke
`subscribeToSymbols()` selain yang sudah dihapus di Perubahan 2.2, itu berarti
file berbeda dari yang diasumsikan dokumen ini — STOP dan laporkan.

### Perubahan 2.4 — tambah `case "tracking_status"` di `handleMessage()`

**FIND:**
```ts
      switch (msg.type) {
        case "price_update":
          this.handlePriceTick(msg);
          break;
        case "ohlc_update":
          this.handleOHLCUpdate(msg);
          break;
        case "track_mbook":
          this.handleMarketBookUpdate(msg);
          break;
        case "calendar_update":
          this.handleCalendarUpdate(msg);
          break;
      }
```

**REPLACE WITH:**
```ts
      switch (msg.type) {
        case "price_update":
          this.handlePriceTick(msg);
          break;
        case "ohlc_update":
          this.handleOHLCUpdate(msg);
          break;
        case "track_mbook":
          this.handleMarketBookUpdate(msg);
          break;
        case "calendar_update":
          this.handleCalendarUpdate(msg);
          break;
        case "tracking_status":
          this.handleTrackingStatus(msg);
          break;
      }
```

### Perubahan 2.5 — tambah method `handleTrackingStatus()`, taruh persis sebelum `handleCalendarUpdate()`

**FIND:**
```ts
  private handleCalendarUpdate(msg: any): void {
```

**REPLACE WITH:**
```ts
  private handleTrackingStatus(msg: any): void {
    this.lastTrackingStatusAt = Date.now();

    if (this.callbacks.onTrackingStatus) {
      this.callbacks.onTrackingStatus({
        price: !!msg.price,
        ohlc: !!msg.ohlc,
        mbook: !!msg.mbook,
        calendar: !!msg.calendar,
        uptimeSec: typeof msg.uptime_sec === "number" ? msg.uptime_sec : 0,
      });
    }
  }

  private handleCalendarUpdate(msg: any): void {
```

### Perubahan 2.6 — panggil `stopStatusWatchdog()` di `disconnect()`

**FIND:**
```ts
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
```

**REPLACE WITH:**
```ts
  disconnect(): void {
    this.stopStatusWatchdog();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
```

---

## File 3 — `background/jobs/Mt5SubscriptionJob.ts`

### Tujuan
Daftarin `onReconnect` dan `onTrackingStatus` di `setCallbacks()`, bandingkan
`tracking_status` dari EA terhadap `env.MT5_TRACK_*`.

**Prasyarat:** File ini butuh `env` yang sudah di-import
(`import { env } from "@config/env.js";` — cek sudah ada di baris import,
biasanya sudah ada karena dipakai di `setupSubscriptions()`).

### FIND (persis)
```ts
    // Set up broker callbacks to route real-time data to MarketDataService
    brokerClient.setCallbacks({
      onPriceTick: async (tick) => {
        // logger.debug(`Price update: ${tick.symbol} bid=${tick.bid} ask=${tick.ask}`, { context: "Broker" });
        await marketDataService.handlePriceTick(tick);
      },
      onOHLCUpdate: async (update) => {
        logger.debug(`OHLC update: ${update.symbol} ${update.timeframe}`, { context: "Broker" });
        await marketDataService.handleOHLCUpdate(update);
      },
      onMarketBookUpdate: async (update) => {
        logger.debug(`Market book update: ${update.symbol}`, { context: "Broker" });
        await marketDataService.handleMarketBookUpdate(update);
      },
      onCalendarUpdate: async (update) => {
        logger.debug(`Calendar Live Update [Event ${update.event_id}] - Actual: ${update.actual} | Forecast: ${update.forecast} | Prev: ${update.previous}`, { context: "Broker" });
        const calendarService = container.resolve(CalendarService);
        await calendarService.handleLiveUpdate(update);
      }
    });
```

### REPLACE WITH
```ts
    // Set up broker callbacks to route real-time data to MarketDataService
    brokerClient.setCallbacks({
      onPriceTick: async (tick) => {
        // logger.debug(`Price update: ${tick.symbol} bid=${tick.bid} ask=${tick.ask}`, { context: "Broker" });
        await marketDataService.handlePriceTick(tick);
      },
      onOHLCUpdate: async (update) => {
        logger.debug(`OHLC update: ${update.symbol} ${update.timeframe}`, { context: "Broker" });
        await marketDataService.handleOHLCUpdate(update);
      },
      onMarketBookUpdate: async (update) => {
        logger.debug(`Market book update: ${update.symbol}`, { context: "Broker" });
        await marketDataService.handleMarketBookUpdate(update);
      },
      onCalendarUpdate: async (update) => {
        logger.debug(`Calendar Live Update [Event ${update.event_id}] - Actual: ${update.actual} | Forecast: ${update.forecast} | Prev: ${update.previous}`, { context: "Broker" });
        const calendarService = container.resolve(CalendarService);
        await calendarService.handleLiveUpdate(update);
      },

      // Layer 1 (reactive): every time the WS (re)connects - network blip OR
      // EA restart - re-apply tracking config from .env. Idempotent when the
      // EA is still alive with the same config; this is what actually fixes
      // the case where the EA restarted and lost its tracking state.
      onReconnect: () => {
        logger.info("MT5 WS (re)connected - re-applying tracking subscriptions", { context: "Broker" });
        Mt5SubscriptionJob.setupSubscriptions().catch(err =>
          logger.error("Resubscribe on reconnect failed", { context: "Broker", error: (err as Error).message })
        );
      },

      // Layer 2 (proactive): compare what the EA says is active right now
      // against what .env says should be active. Mismatch means the EA's
      // tracking config diverged from what we expect - resubscribe.
      onTrackingStatus: (status) => {
        const trackingSymbols = env.MT5_TRACKING_SYMBOLS;
        const expected = {
          price: env.MT5_TRACK_PRICES && trackingSymbols.length > 0,
          ohlc: env.MT5_TRACK_OHLC && trackingSymbols.length > 0,
          mbook: env.MT5_TRACK_MBOOK && trackingSymbols.length > 0,
          calendar: env.MT5_TRACK_CALENDAR,
        };

        const mismatch =
          status.price !== expected.price ||
          status.ohlc !== expected.ohlc ||
          status.mbook !== expected.mbook ||
          status.calendar !== expected.calendar;

        if (mismatch) {
          logger.warn("MT5 tracking status mismatch vs .env - resubscribing", {
            context: "Broker",
            expected,
            actual: { price: status.price, ohlc: status.ohlc, mbook: status.mbook, calendar: status.calendar },
            uptimeSec: status.uptimeSec,
          });
          Mt5SubscriptionJob.setupSubscriptions().catch(err =>
            logger.error("Resubscribe after status mismatch failed", { context: "Broker", error: (err as Error).message })
          );
        }
      },
    });
```

**Catatan penting soal `expected.price/ohlc/mbook`:** logika ini SENGAJA
mengikuti persis kondisi yang sudah ada di `setupSubscriptions()` — yaitu
`env.MT5_TRACK_PRICES && trackingSymbols.length > 0` (bukan cuma
`env.MT5_TRACK_PRICES` saja). Kalau user set `TRACK_PRICE=true` tapi
`MT5_TRACKING_SYMBOLS` kosong, EA memang tidak akan nge-track apa pun, dan itu
BUKAN mismatch. JANGAN sederhanakan kondisi ini jadi cuma
`env.MT5_TRACK_PRICES`, karena itu akan menyebabkan false-positive mismatch
tiap 5 detik kalau symbol list kosong.

`expected.calendar` cuma `env.MT5_TRACK_CALENDAR` (tanpa syarat symbol list),
karena calendar tracking di `setupSubscriptions()` memang tidak bergantung ke
`trackingSymbols`.

---

## Checklist verifikasi (jalankan setelah 3 file di atas selesai diedit)

1. `npx tsc --noEmit` (atau perintah build/typecheck project ini) — harus
   lolos tanpa error tipe. Kalau ada error di `Mt5SubscriptionJob.ts` soal
   `env` tidak dikenali, cek ulang import `env` di bagian atas file — jangan
   tambahkan import baru kalau sudah ada, dan jangan hapus import lain.
2. `grep -rn "subscribeToSymbols" Backend/src-new` — harus **kosong** (0
   hasil). Kalau masih ada hasil, berarti Perubahan 2.2 atau 2.3 belum
   lengkap diterapkan.
3. `grep -n "onReconnect\|onTrackingStatus" Backend/src-new/application/ports/IBrokerProvider.ts` —
   harus muncul di interface `TrackingStatus`, `BrokerCallbacks`.
4. `grep -n "onReconnect:\|onTrackingStatus:" Backend/src-new/background/jobs/Mt5SubscriptionJob.ts` —
   harus muncul persis 1x masing-masing, di dalam `setCallbacks({...})`.
5. Jalankan backend secara lokal (kalau ada MT5 Bridge EA yang jalan di
   `MT5_BRIDGE_URL`), cek log startup harus ada baris:
   `"MT5 WebSocket connected"` diikuti (dalam waktu dekat) log dari
   `onReconnect` callback: `"MT5 WS (re)connected - re-applying tracking subscriptions"`.
6. Simulasi manual (opsional tapi disarankan): matikan EA (remove dari chart
   atau restart terminal MT5) selama >20 detik lalu nyalakan lagi. Backend
   harus log baris `"No tracking_status from MT5 EA in ...ms - assuming EA
   dead, forcing reconnect"`, lalu setelah EA hidup lagi harus log
   `"MT5 WS (re)connected - re-applying tracking subscriptions"`, dan data
   tick harus mulai ngalir lagi tanpa restart proses Node.js.

Kalau salah satu poin checklist gagal, JANGAN menambal dengan solusi
tambahan di luar dokumen ini. Laporkan poin mana yang gagal dan isi error
yang muncul.
