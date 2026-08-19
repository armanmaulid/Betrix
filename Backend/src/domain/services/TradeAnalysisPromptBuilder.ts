import { injectable } from "tsyringe";

export interface TradeCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface NewsHeadline {
  source: string;
  title: string;
}

/**
 * Prompt builder privat untuk analisa trading + konteks berita.
 *
 * Migrasi verbatim dari `buildTradeAnalysisPrompt` / `buildNewsContextPrefix`
 * di frontend (src/shared/lib/analyzePageHelpers.tsx) supaya instruksi format
 * jawaban + template prompt tidak lagi terekspos di bundle klien (menutup prompt
 * injection / leakage).
 *
 * Pure — tanpa IO. Semua input datang dari caller (application service).
 */
@injectable()
export class TradeAnalysisPromptBuilder {
  buildTradeContext(input: {
    symbol: string;
    timeframe: string;
    candles: TradeCandle[];
  }): string {
    const { symbol, timeframe, candles } = input;

    if (!candles || candles.length === 0) {
      return [
        `[DATA PASAR TIDAK TERSEDIA]`,
        `Data candle ${symbol} (${timeframe}) kosong/gagal diambil dari MT5 bridge. Beritahu user datanya sedang tidak tersedia, JANGAN mengarang harga.`,
      ].join("\n");
    }

    const recent = candles.slice(-100);
    const detail = recent.slice(-20);
    const currentPrice = recent[recent.length - 1].close;
    const rangeHigh = Math.max(...recent.map((c) => c.high));
    const rangeLow = Math.min(...recent.map((c) => c.low));

    const candleLines = detail
      .map((c) => {
        const t = new Date(c.time * 1000).toISOString().slice(5, 16).replace("T", " ");
        return `${t} O:${c.open} H:${c.high} L:${c.low} C:${c.close}`;
      })
      .join("\n");

    return [
      `[DATA PASAR REALTIME - MT5]`,
      `Symbol: ${symbol} | Timeframe: ${timeframe}`,
      `Harga terkini: ${currentPrice}`,
      `Range ${recent.length} candle terakhir: High ${rangeHigh} / Low ${rangeLow}`,
      `${detail.length} candle terbaru (waktu UTC, terlama -> terbaru):`,
      candleLines,
      ``,
      `[INSTRUKSI FORMAT JAWABAN]`,
      `Wajib sertakan: Entry, Stop Loss (SL), Take Profit 1/2/3 (TP1, TP2, TP3), alasan teknikal berbasis data di atas, dan alternate entry kalau entry utama gagal atau kena SL. Gunakan HANYA data di atas, jangan mengarang harga yang tidak ada di data.`,
    ].join("\n");
  }

  buildNewsContext(items: NewsHeadline[]): string {
    if (items.length === 0) return "";
    const lines = items.slice(0, 10).map((n) => `- [${n.source}] ${n.title}`).join("\n");
    return `[BERITA TERBARU]\n${lines}\n\n`;
  }
}
