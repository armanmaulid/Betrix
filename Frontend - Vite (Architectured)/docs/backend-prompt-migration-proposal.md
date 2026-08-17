# Proposal: Pindahkan Konstruksi Prompt LLM ke Backend

**Untuk:** Tim Backend Betrix
**Dari:** Tim Frontend (Vite)
**Tanggal:** 2026-08-17
**Status:** Diajukan — menunggu review & estimasi timeline
**Prioritas:** High (Security & Integrity)
**Klasifikasi:** Addition-only di sisi backend — TIDAK menyentuh model auth, CORS, atau schema DB.

---

## 1. Ringkasan eksekutif

Saat ini frontend **membangun seluruh prompt analisa trading di sisi klien** (file
`src/shared/lib/analyzePageHelpers.tsx` → `buildTradeAnalysisPrompt`, dipanggil dari
`src/features/chat/hooks/useChatStream.ts`). Prompt itu berisi: instruksi sistem,
aturan format jawaban (Entry/SL/TP1-3 + alternate entry), dan **data candlestick MT5
mentah** — lalu seluruh blok itu dikirim sebagai satu string `message` ke endpoint chat.

Proposal ini memindahkan seluruh konstruksi prompt itu ke backend. Frontend cukup
mengirim **intent + metadata terstruktur**; backend yang mengambil data MT5 secara
internal, menyusun prompt dari template privat, lalu memanggil LLM.

**Manfaat langsung:**
- **Menutup prompt injection / leakage** — instruksi sistem & aturan format tak lagi
  terekspos di bundle JavaScript (bisa dibaca/dibypass user).
- **Menutup data spoofing** — user tak bisa menyuntik candlestick palsu sebelum request
  ke LLM; data kini diambil backend langsung dari broker.
- **Payload lebih kecil** — data candle tak lagi diunduh ke klien lalu diunggah balik.
- **Perubahan format jawaban = deploy backend saja**, tanpa rilis frontend.

---

## 2. Kondisi saat ini (grounded ke kode aktual)

### 2.1 Alur frontend hari ini (`useChatStream.ts`)
1. Parse command instrumen (`parseInstrumentCommand`: `/forex XAUUSD M15` → `{symbol, timeframe}`).
2. Validasi simbol ke daftar broker (`allBrokerSymbols` dari `GET /api/v1/market/symbols`)
   + cek kategori (forex/crypto/stock/dst).
3. Fetch candle via `GET /api/v1/market/ohlc/:symbol/:timeframe` (`fetchOHLC`).
4. Fetch berita konteks via `GET /api/v1/news?asset=…` per tab aktif.
5. Susun prompt via `buildTradeAnalysisPrompt(candles, text)` — **instruksi format +
   tabel candle di-hardcode di klien**.
6. Kirim sebagai `message` ke `POST /api/v1/chat/stream`.

### 2.2 Risiko
- 🔴 **Prompt injection & leakage:** instruksi `"Wajib sertakan: Entry, Stop Loss (SL),
  Take Profit 1/2/3…"` dan aturan `"JANGAN mengarang harga"` terbaca jelas di bundle.
  User bisa menyalin/memodifikasi aturan atau memaksa output keluar format.
- 🔴 **Data manipulation:** user bisa mencegat request dan mengubah isi candle sebelum
  sampai LLM → analisa palsu berbasis data bohong.
- 🟡 **Network inefficiency:** candle diunduh ke klien hanya untuk diunggah balik.
- 🟡 **Maintainability:** ubah perilaku AI = deploy frontend.

### 2.3 Yang SUDAH ada di backend (blok yang bisa dipakai langsung)
| Kebutuhan | Sudah tersedia | Lokasi |
| --- | --- | --- |
| Ambil candle MT5 internal | ✅ `getOHLC(symbol, timeframe)` | `src/application/services/MarketDataService.ts:84` |
| Validasi/daftar simbol broker | ✅ `getSymbols()` / `getSymbolInfo()` / `getSymbolsByCategory()` | `MarketDataService.ts` + `SymbolRepository` |
| Ambil berita per asset | ✅ `GetNewsUseCase.execute({limit, offset, asset})` | `src/contexts/news/application/use-cases/GetNewsUseCase.ts` |
| System prompt per taskType | ✅ `AiPromptRegistry.getSystemPrompt(taskType)` | `src/domain/services/AiPromptRegistry.ts` |
| Pipeline stream → LLM | ✅ `StreamMessageUseCase.execute()` | `src/application/use-cases/chat/StreamMessageUseCase.ts` |
| DTO request chat | ✅ `sendMessageDto` (zod) | `src/application/dtos/chat.dto.ts` |

Artinya: **backend tidak perlu membangun infrastruktur baru** — cukup menambah satu
field di DTO + satu langkah "susun context" di `StreamMessageUseCase`.

---

## 3. Kontrak API baru

### 3.1 Payload request `POST /api/v1/chat/stream` (dan `POST /api/v1/chat`)

Menambah **satu field opsional** `contextParams`. Field lain tidak berubah.

**Contoh analisa trading (`trade_reasoning`):**
```json
{
  "message": "bagaimana arah gold?",
  "taskType": "trade_reasoning",
  "sessionId": "…",
  "contextParams": {
    "type": "market_analysis",
    "symbol": "XAUUSD",
    "timeframe": "M15"
  }
}
```

**Contoh konteks berita (`market_insight`):**
```json
{
  "message": "ringkas kondisi market",
  "taskType": "market_insight",
  "contextParams": {
    "type": "news_context",
    "assets": ["usd", "metal", "oil", "btc"]
  }
}
```

**Tanpa `contextParams`** → perilaku persis seperti sekarang (backward compatible).

### 3.2 Schema zod yang diusulkan (`src/application/dtos/chat.dto.ts`)

```ts
const contextParamsSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("market_analysis"),
    symbol: z.string().min(1).max(20).transform((s) => s.toUpperCase()),
    timeframe: z.enum(["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1"]),
  }),
  z.object({
    type: z.literal("news_context"),
    assets: z.array(z.string().min(1)).min(1).max(6),
  }),
]);

export const sendMessageDto = z.object({
  message: z.string().min(1).max(8000),
  taskType: chatTaskTypeSchema.default("general"),
  displayMessage: z.string().optional(),
  history: /* …tetap… */,
  sessionId: z.string().uuid().optional(),
  tier: modelTierSchema.optional(),
  image: z.string().nullish(),
  contextParams: contextParamsSchema.optional(),   // ← BARU
});
```

### 3.3 Aturan validasi asset
`news_context.assets` HARUS tervalidasi terhadap `VALID_ASSETS` yang sudah ada di
`src/presentation/controllers/NewsController.ts:7` (`usd, eur, gbp, jpy, metal, oil,
btc, eco, global, crypto`). Nilai di luar daftar → `400 VALIDATION_ERROR`.

---

## 4. Desain implementasi backend

### 4.1 Prompt builder privat (baru)
Buat `src/domain/services/TradeAnalysisPromptBuilder.ts` (pure, testable, sejajar
dengan `AiPromptRegistry`/`ModelPolicy`). Isi = migrasi verbatim dari
`buildTradeAnalysisPrompt` di frontend:

- Terima `{ symbol, timeframe, candles, userText }` → kembalikan blok context berisi:
  - `[DATA PASAR REALTIME - MT5]` + harga terkini + range + tabel 20 candle terakhir.
  - `[INSTRUKSI FORMAT JAWABAN]` (Entry/SL/TP1-3, alasan teknikal, alternate entry,
    "JANGAN mengarang harga").
- Terima kasus **candle kosong/gagal** → kembalikan `[DATA PASAR TIDAK TERSEDIA]`
  (instruksi ke LLM untuk bilang data tak tersedia, bukan mengarang).

> Instruksi format jawaban (`Wajib sertakan: Entry, SL, TP1/2/3…`) hari ini ada di
> **body message**, bukan di system prompt. Rekomendasi: pindahkan ke hasil builder ini
> (tetap sebagai blok context) ATAU naikkan ke `AiPromptRegistry.getSystemPrompt("trade_reasoning")`.
> Pilih salah satu; opsi pertama lebih cepat (perilaku identik dengan sekarang).

### 4.2 Ubah `StreamMessageUseCase.execute()`
Sisipkan langkah setelah `sanitizeHistory`, sebelum membangun `messages`:

```ts
// pseudocode
let contextBlock = "";
if (input.contextParams?.type === "market_analysis") {
  const { symbol, timeframe } = input.contextParams;
  // (opsional) validasi simbol via symbolRepo; jika tak dikenal → throw
  // ValidationError(SYMBOL_NOT_FOUND) / SYMBOL_CATEGORY_MISMATCH — lihat §4.4.
  const candles = await this.marketDataService.getOHLC(symbol, timeframe);
  contextBlock = this.promptBuilder.buildTradeContext({ symbol, timeframe, candles });
} else if (input.contextParams?.type === "news_context") {
  const articles = await this.newsUseCase.fetchForAssets(input.contextParams.assets);
  contextBlock = this.promptBuilder.buildNewsContext(articles);
}

const userContent = contextBlock
  ? `${contextBlock}\n\n[PERMINTAAN USER]\n${input.message}`
  : input.message;

const messages = [...cleanHistory, { role: "user", content: userContent.substring(0, LIMITS.MESSAGE_MAX_LENGTH) }];
```

Catatan injeksi dependensi: `StreamMessageUseCase` perlu tambah `@inject("MarketDataService")`
dan `@inject("GetNewsUseCase")` (atau port berita). Keduanya sudah ada di container.

### 4.3 Fallback MT5 gagal (WAJIB)
Kalau `getOHLC` throw (bridge down / `ECONNREFUSED`), **JANGAN** gagalkan seluruh request
dengan 5xx. Tangkap, lalu bangun context `[DATA PASAR TIDAK TERSEDIA]` — LLM tetap jalan
dan bilang ke user datanya sedang tidak tersedia. Ini persis perilaku `catch` di
`useChatStream.ts:131-133` hari ini.

> `MarketController.getOHLC` sudah memetakan `ECONNREFUSED`/`fetch failed` → 503
> `BROKER_UNAVAILABLE`. Reuse pola deteksi yang sama di use-case untuk membedakan
> "MT5 down" (→ fallback context) vs error tak terduga (→ 500).

### 4.4 Validasi simbol (pindah dari frontend)
Frontend hari ini menolak simbol yang tak ada / kategori salah sebelum fetch. Pindahkan
ke backend supaya aturannya konsisten & tak bisa dibypass:

- Simbol tak dikenal → `400 { error: "Symbol not found", code: "SYMBOL_NOT_FOUND" }`.
- Kategori tak cocok dengan command (mis. `XAUUSD` dipakai via `/forex`) →
  `400 { error: "Symbol category mismatch", code: "SYMBOL_CATEGORY_MISMATCH" }`.

Frontend akan menampilkan pesan bersih dari `code` ini (bukan menyuntik `[KESALAHAN INPUT USER]`
ke prompt lagi).

**Pertanyaan untuk tim backend:** apakah validasi kategori perlu tahu *command* asal
(`/forex` vs `/crypto`)? Kalau iya, `contextParams` perlu satu field opsional `command`.
Kalau mau sederhana, cukup validasi "simbol dikenal broker" — pemetaan kategori command
bisa ditunda (frontend sudah punya popover suggestion untuk mencegah mismatch).

### 4.5 DTO & controller
- `chat.dto.ts`: tambah `contextParams` (schema §3.2).
- `ChatController.streamMessage`: teruskan `req.body.contextParams` ke use-case (satu baris).

---

## 5. Scope frontend (setelah backend live)

Hapus dari `useChatStream.ts` + `analyzePageHelpers.tsx`:
- `buildTradeAnalysisPrompt` (pindah ke backend, §4.1).
- Fetch candle `fetchOHLC` + validasi simbol `allBrokerSymbols.find` (backend ambil alih, §4.2/§4.4).
- Fetch berita `getNews(...)` + `buildNewsContextPrefix` (backend ambil alih via `news_context`).
- Kirim `contextParams` terstruktur, bukan string prompt raksasa.
- `parseInstrumentCommand` TETAP dipakai — hanya untuk mengekstrak `{symbol, timeframe}`
  yang dikirim sebagai `contextParams`.

---

## 6. Urutan rilis & verifikasi

**Urutan aman (hindari frontend rusak di tengah):**
1. Backend deploy: tambah `contextParams` (backward-compatible, field opsional).
2. Frontend merge: kirim `contextParams`, hapus build-prompt klien.
3. Verifikasi bersama.

> Karena `contextParams` opsional, backend bisa deploy duluan tanpa merusak frontend
> lama (frontend lama tidak mengirim field itu → perilaku lama tetap jalan).

**Checklist verifikasi:**
- [ ] `/forex XAUUSD M15 analisa…` → respons streaming masuk, isi candle/format Entry/SL/TP muncul.
- [ ] Data candle tidak lagi terlihat di request body frontend (DevTools → Network → payload hanya `message` + `contextParams`, tanpa tabel candle).
- [ ] Simbol tak dikenal → `400 SYMBOL_NOT_FOUND`, UI menampilkan pesan bersih.
- [ ] MT5 bridge dimatikan → LLM balas "[DATA PASAR TIDAK TERSEDIA]" (tidak 500, tidak mengarang harga).
- [ ] `news_context` → berita konteks tersaji di jawaban tanpa fetch berita dari klien.
- [ ] Chat biasa (tanpa `contextParams`) tetap jalan identik.

---

## 7. Pertanyaan untuk tim backend (butuh jawaban sebelum implementasi)

1. **Instruksi format jawaban** — taruh di body context (§4.1 opsi cepat) atau naikkan ke
   system prompt `trade_reasoning`? (rekomendasi: context block, perilaku identik).
2. **Validasi kategori simbol** — perlu tahu `command` asal (`/forex`/`/crypto`) atau cukup
   "simbol dikenal broker"?
3. **News context** — frontend kirim `assets` (sudah di-resolve dari tab), atau backend
   yang mapping tab→assets? (rekomendasi: frontend kirim `assets`, backend tak perlu tahu tab).
4. **Estimasi timeline** untuk: DTO + builder + use-case + validasi + fallback + test unit.

---

## 8. Referensi file (backend)

| File | Peran |
| --- | --- |
| `src/application/dtos/chat.dto.ts` | Tambah `contextParams` |
| `src/application/use-cases/chat/StreamMessageUseCase.ts` | Susun context sebelum kirim LLM |
| `src/domain/services/TradeAnalysisPromptBuilder.ts` | **BARU** — template prompt privat |
| `src/application/services/MarketDataService.ts` | `getOHLC` (sudah ada) |
| `src/contexts/news/application/use-cases/GetNewsUseCase.ts` | Fetch berita per asset (sudah ada) |
| `src/presentation/controllers/ChatController.ts` | Teruskan `contextParams` (1 baris) |
| `src/presentation/controllers/NewsController.ts:7` | `VALID_ASSETS` (reuse untuk validasi) |
