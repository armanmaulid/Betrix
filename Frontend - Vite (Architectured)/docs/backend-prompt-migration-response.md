# Proposal Balasan — Prompt Migration (Backend → Frontend)

Status: **✅ KONTRAK BACKEND SELESAI & TERVERIFIKASI LIVE — FE BISA LANGSUNG EKSEKUSI §5**
Tanggal: 2026-08-17
Asal: Backend Betrix (balasan untuk `docs/backend-prompt-migration-proposal.md`)
Tujuan: memberi Tim Frontend **kontrak final + jawaban §7 + gotcha** agar migration prompt bisa dieksekusi sekarang.

---

## 1. Ringkasan

Seluruh proposal (`backend-prompt-migration-proposal.md`) diimplementasikan di backend.
Konstruksi prompt analisa trading + konteks berita **dipindah ke backend**. Frontend kini
cukup mengirim `contextParams` terstruktur; data MT5 diambil backend langsung dari broker.

**Manfaat (terverifikasi):**
- Instruksi format jawaban (Entry/SL/TP1-3) **tidak lagi** terekspos di bundle JS.
- Candle diambil server-side — user **tidak bisa** menyuntik data palsu.
- Payload request FE turun drastis (tidak ada tabel candle di body).

---

## 2. Jawaban §7 (pertanyaan tim backend)

| # | Pertanyaan | Jawaban |
|---|---|---|
| 1 | Instruksi format: context block atau system prompt? | **Context block** (opsi cepat). Perilaku identik sekarang; kalau naik ke system prompt `trade_reasoning`, pesan non-instrument ikut kena instruksi Entry/SL/TP (regresi). |
| 2 | Validasi kategori simbol: perlu `command`? | **Tidak.** Cukup "simbol dikenal broker" (`SYMBOL_NOT_FOUND`). Kategori tetap di FE (popover). |
| 3 | News: FE kirim `assets` atau backend map tab→assets? | **FE kirim `assets`.** Backend tidak tahu tab. |
| 4 | Estimasi timeline | ✅ Selesai (lihat §3). |

**Deviasi yang perlu FE tahu:**
- **`SYMBOL_CATEGORY_MISMATCH` TIDAK diimplementasikan** (konsekuensi jawaban #2). Hanya ada `SYMBOL_NOT_FOUND`.
- **`AppError("SYMBOL_NOT_FOUND", 400)`** — bukan `ValidationError`, supaya `code` di response = `SYMBOL_NOT_FOUND` (bukan `VALIDATION_ERROR`).

---

## 3. Kontrak final — persis untuk FE

### 3.1 Payload request `POST /api/v1/chat/stream` (dan `/chat`)

Field `contextParams` **opsional**. Tanpa field → perilaku lama identik (backward compatible).

**Analisa trading (`trade_reasoning`):**
```json
{
  "message": "bagaimana arah gold?",
  "taskType": "trade_reasoning",
  "contextParams": {
    "type": "market_analysis",
    "symbol": "XAUUSD",
    "timeframe": "M15"
  }
}
```

**Konteks berita (`market_insight`):**
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

### 3.2 Schema validasi (di-enforce backend)

- `market_analysis.symbol`: `string 1..20`, **otomatis uppercase**.
- `market_analysis.timeframe`: `enum M1|M5|M15|M30|H1|H4|D1|W1|MN1`.
- `news_context.assets`: `enum` dari 10 asset valid (`usd, eur, gbp, jpy, metal, oil, btc, eco, global, crypto`), **min 1, max 6**.
- `contextParams.type` salah → `400 VALIDATION_ERROR` (path `contextParams.timeframe` / `contextParams.assets.0`).

### 3.3 Error code yang FE harus render

| Kondisi | Response |
|---|---|
| Simbol tak dikenal broker | **400** `{ "error": "Symbol not found: <SYM>", "code": "SYMBOL_NOT_FOUND" }` |
| Timeframe / asset invalid | **400** `{ "error": "Validation failed", "code": "VALIDATION_ERROR", "details": { "errors": [...] } }` |
| MT5 bridge down | **Bukan error** — LLM tetap menjawab "data tidak tersedia" (lihat §4). |

### 3.4 Streaming error (PENTING — berubah dari perilaku lama)

- Error **sebelum** token pertama (mis. `SYMBOL_NOT_FOUND`, validasi) → **JSON `4xx`**, bukan `event: error`.
- Error **setelah** stream mulai (AI gateway down) → tetap `event: error` + `data: {error}`.
- FE harus **cek `res.ok` dulu** sebelum parse SSE. Kalau `!res.ok` → baca JSON error (bukan parse stream).

---

## 4. Fallback MT5 (persis perilaku lama)

Kalau `getOHLC` gagal (bridge down / `ECONNREFUSED`), backend **TIDAK** throw 5xx — ia bangun
context `[DATA PASAR TIDAK TERSEDIA]` dan LLM menjawab "data tidak tersedia, jangan mengarang harga".
Sama persis `catch` di `useChatStream.ts:131-133` lama. FE tidak perlu handle khusus.

---

## 5. Scope FE (yang harus dihapus / diganti)

Di `useChatStream.ts` + `analyzePageHelpers.tsx`:

- **Hapus** `buildTradeAnalysisPrompt` (pindah ke backend).
- **Hapus** fetch candle `fetchOHLC` + validasi `allBrokerSymbols.find` (backend ambil alih).
- **Hapus** fetch berita `getNews(...)` + `buildNewsContextPrefix` (backend ambil alih via `news_context`).
- **Kirim** `contextParams` terstruktur, bukan string prompt raksasa.
- **Tetap pakai** `parseInstrumentCommand` — hanya untuk ekstrak `{symbol, timeframe}` → `contextParams`.

### 5.1 Catatan tambahan — command FE wajib sinkron kategori broker

Ditemukan saat review: `CHAT_SHORTCUTS` (9 command hardcode) + mapping kategori manual
(`useChatStream.ts:99-107`) **tidak sinkron** dengan `category`/`path` aktual dari broker.
Contoh nyata: user ngetik `/futures XAUUSD M5` — padahal XAUUSD itu **metal/commodity**,
bukan futures. Backend (karena validasi kategori sengaja di-skip) tetap fetch XAUUSD apa adanya
tanpa menolak.

**Rekomendasi:** command yang tampil di popover **derive dari `allBrokerSymbols[].category`**
(data `GET /api/v1/market/symbols`), bukan daftar hardcode. Mapping kategori→command jadi
**satu sumber** (kategori broker), FE cuma konsumen. Ini menghindari command "maksa kehendak"
yang tidak cocok dengan kategori broker asli.

---

## 6. Urutan rilis & verifikasi

**Urutan aman:**
1. Backend deploy (field opsional → FE lama tetap jalan).
2. FE merge: kirim `contextParams`, hapus build-prompt klien.
3. Verifikasi bersama.

**Checklist verifikasi FE:**
- [ ] `/forex XAUUSD M15 analisa…` → respons streaming masuk, format Entry/SL/TP muncul.
- [ ] DevTools → Network → payload chat **hanya** `message` + `contextParams` (tanpa tabel candle).
- [ ] Simbol tak dikenal → `400 SYMBOL_NOT_FOUND`, UI tampilkan pesan bersih.
- [ ] MT5 bridge dimatikan → LLM balas "[DATA PASAR TIDAK TERSEDIA]" (bukan 500, bukan mengarang harga).
- [ ] `news_context` → berita konteks tersaji di jawaban tanpa fetch berita dari klien.
- [ ] Chat biasa (tanpa `contextParams`) tetap jalan identik.

---

## 7. Bukti verifikasi backend

- `npx tsc --noEmit` → **0** · `npm run lint` → **0/0** · boundary `import/no-restricted-paths` → **0** · `npm test` → **14 files / 84 tests / 0 failed**.

**E2E live (2026-08-17, DB/Redis Docker ON, server tsx :3000):**

| Skenario | Hasil |
|---|---|
| `market_analysis` stream (balanced) | ✅ 391 token, `event: done`, format Entry/SL/TP muncul |
| `news_context` stream | ✅ 9377 byte, ringkasan berita masuk |
| Simbol unknown → 400 `SYMBOL_NOT_FOUND` | ✅ (stream + non-stream) |
| Timeframe invalid → 400 `VALIDATION_ERROR` | ✅ |
| Asset invalid → 400 `VALIDATION_ERROR` | ✅ |
| MT5 down → fallback `[DATA PASAR TIDAK TERSEDIA]` | ✅ |
| Chat biasa tanpa `contextParams` | ✅ identik |

### ⚠️ Catatan infra (bukan kode) — perlu tindakan Backend/Ops

Model `dahono/qwen3.8-max` (tier **deep**, dipakai `trade_reasoning` & `risk_narrative`)
→ gateway 404 `No active credentials for provider: openai` / `model_not_found`.
**Efek:** `trade_reasoning` tanpa `tier` override balas kosong. E2E memakai `tier:balanced`
(kimi-k3) untuk verifikasi — model itu jalan.

> **Perlu provision model `dahono/qwen3.8-max` di gateway**, atau ganti `MODEL_DEEP` di `.env`.
> Ini blocker untuk `trade_reasoning` default sebelum FE merge.

---

## 8. Referensi file backend

| File | Peran |
| --- | --- |
| `src/application/dtos/chat.dto.ts` | + `contextParams` (schema §3.2) |
| `src/domain/services/TradeAnalysisPromptBuilder.ts` | **BARU** — template prompt privat (pure) |
| `src/application/services/TradeAnalysisContextService.ts` | **BARU** — orchestrate symbol-validate + getOHLC + news |
| `src/application/use-cases/chat/StreamMessageUseCase.ts` | sisipkan context block sebelum LLM |
| `src/application/use-cases/chat/SendMessageUseCase.ts` | sisipkan context block sebelum LLM |
| `src/presentation/controllers/ChatController.ts` | teruskan `contextParams` + SSE lazy-header (error → JSON 4xx) |
| `src/contexts/news/domain/NewsContextPort.ts` | + `getLatestHeadlines` (port antar-konteks) |
| `src/contexts/news/infrastructure/PgNewsRepository.ts` | impl `getLatestHeadlines` |
| `src/core/constants/index.ts` | + `NEWS_ASSETS` |
