import type { Candle } from "../../features/market/api/marketClient";
import type { NewsItem } from "../../features/news/api/newsClient";
import type { Components } from "react-markdown";

// Styling elemen Markdown supaya senada dengan tema terminal gelap Betrix
// (aksen orange --accent, border --border) alih-alih default browser polos.
export const markdownComponents: Components = {
  h1: (props) => <h3 className="text-[13px] font-bold text-[var(--accent)] mt-3 mb-1.5 first:mt-0" {...props} />,
  h2: (props) => <h3 className="text-[13px] font-bold text-[var(--accent)] mt-3 mb-1.5 first:mt-0" {...props} />,
  h3: (props) => <h4 className="text-[12px] font-bold text-[var(--accent)] mt-2.5 mb-1 first:mt-0" {...props} />,
  p: (props) => <p className="text-[12px] leading-relaxed text-[var(--text-primary)] mb-2 last:mb-0" {...props} />,
  strong: (props) => <strong className="font-bold text-white" {...props} />,
  em: (props) => <em className="italic text-[var(--text-primary)]" {...props} />,
  ul: (props) => <ul className="list-disc list-outside pl-4 mb-2 space-y-0.5 text-[12px] text-[var(--text-primary)]" {...props} />,
  ol: (props) => <ol className="list-decimal list-outside pl-4 mb-2 space-y-0.5 text-[12px] text-[var(--text-primary)]" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  hr: () => <hr className="border-t border-[var(--border)] my-3" />,
  code: (props) => <code className="bg-[var(--surface-alt)] border border-[var(--border)] px-1 py-0.5 text-[11px] text-[var(--accent)]" {...props} />,
  blockquote: (props) => <blockquote className="border-l-2 border-[var(--accent)] pl-3 text-[var(--text-muted)] italic my-2" {...props} />,
};

// Command instrumen yang men-trigger fetch data realtime MT5 (lihat mt5Client.js
// dan GET /api/market/candles di backend). Simbol diambil dari kata setelah command,
// mis. "/forex xauusd analisa ..." -> symbol=XAUUSD.
export const INSTRUMENT_COMMANDS = ["forex", "crypto", "stock", "etf", "bond", "index", "futures"];
export const TIMEFRAME_PATTERN = /\b(M1|M5|M15|M30|H1|H4|D1|W1|MN1)\b/i;

export interface ParsedInstrumentCommand {
  symbol: string;
  timeframe: string;
}

export function parseInstrumentCommand(text: string): ParsedInstrumentCommand | null {
  const match = text.trim().match(/^\/(\w+)\s+(\S+)/);
  if (!match) return null;
  const [, cmd, symbolRaw] = match;
  if (!INSTRUMENT_COMMANDS.includes(cmd.toLowerCase())) return null;
  const tfMatch = text.match(TIMEFRAME_PATTERN);
  return {
    symbol: symbolRaw.replace(/^\/+/, '').toUpperCase(),
    timeframe: tfMatch ? tfMatch[1].toUpperCase() : "M15", // default M15 kalau timeframe tidak disebut
  };
}

// Susun prompt berisi data candle asli dari MT5 + instruksi format jawaban (Entry/SL/TP1-3
// + alasan + alternate entry), supaya LLM menjawab berbasis data nyata, bukan mengarang harga.
export function buildTradeAnalysisPrompt(instrument: ParsedInstrumentCommand, candles: Candle[], originalText: string): string {
  if (!candles || candles.length === 0) {
    return `[DATA PASAR TIDAK TERSEDIA]\nData candle ${instrument.symbol} (${instrument.timeframe}) kosong/gagal diambil dari MT5 bridge. Beritahu user datanya sedang tidak tersedia, JANGAN mengarang harga.\n\n[PERMINTAAN USER]\n${originalText}`;
  }

  const recent = candles.slice(-100);
  const detail = recent.slice(-20); // detail candle dibatasi supaya prompt tidak kepanjangan
  const currentPrice = recent[recent.length - 1].close;
  const rangeHigh = Math.max(...recent.map(c => c.high));
  const rangeLow = Math.min(...recent.map(c => c.low));

  const candleLines = detail.map(c => {
    const t = new Date(c.time * 1000).toISOString().slice(5, 16).replace("T", " ");
    return `${t} O:${c.open} H:${c.high} L:${c.low} C:${c.close}`;
  }).join("\n");

  return [
    `[DATA PASAR REALTIME - MT5]`,
    `Symbol: ${instrument.symbol} | Timeframe: ${instrument.timeframe}`,
    `Harga terkini: ${currentPrice}`,
    `Range ${recent.length} candle terakhir: High ${rangeHigh} / Low ${rangeLow}`,
    `${detail.length} candle terbaru (waktu UTC, terlama -> terbaru):`,
    candleLines,
    ``,
    `[INSTRUKSI FORMAT JAWABAN]`,
    `Wajib sertakan: Entry, Stop Loss (SL), Take Profit 1/2/3 (TP1, TP2, TP3), alasan teknikal berbasis data di atas, dan alternate entry kalau entry utama gagal atau kena SL. Gunakan HANYA data di atas, jangan mengarang harga yang tidak ada di data.`,
    ``,
    `[PERMINTAAN USER]`,
    originalText,
  ].join("\n");
}

// Cermin dari TASK_TIER_MAP + TIER_CREDIT_COST di backend (domain/services/ModelPolicy.ts)
// -- cuma dipakai buat nampilin estimasi biaya kredit di UI, bukan sumber kebenaran
// (backend yang benar-benar motong kreditnya). Key harus sama dengan enum backend
// (ChatTaskType): "faq" bukan taskType valid → jangan dipakai (backend fallback ke balanced).
export const FRONTEND_TASK_TIER_MAP: Record<string, "cheap" | "balanced" | "deep"> = {
  general: "cheap",
  classify_signal: "cheap",
  quick_summary: "balanced",
  market_insight: "balanced",
  trade_reasoning: "deep",
  risk_narrative: "deep",
};
export const TIER_CREDIT_COST: Record<string, number> = { cheap: 1, balanced: 3, deep: 5 };
export const AGENT_TIER_LABEL: Record<"cheap" | "balanced" | "deep", string> = { cheap: "Lite", balanced: "Balanced", deep: "Deep" };

// EQUITY memakai "global" sebagai proxy terdekat karena backend belum punya tag khusus
// saham/equity. NEWS gabung usd+metal+oil sebagai proxy "USD, METAL, OIL, ENERGY" --
// backend belum punya tag "energy" terpisah (kategori yang ada cuma: usd, metal, oil,
// btc, eco, global, crypto -- lihat VALID_ASSETS di routes/news.js), jadi OIL dipakai
// rangkap sebagai proxy energy juga. AUTO sengaja tidak dipetakan = tidak ada injeksi berita.
export const TAB_TO_NEWS_ASSETS: Record<string, string[] | undefined> = {
  AUTO: ["usd"],
  EQUITY: ["global"],
  MACRO: ["eco"],
  NEWS: ["usd", "metal", "oil", "btc"],
};

export function buildNewsContextPrefix(tab: string, items: NewsItem[]): string {
  if (items.length === 0) return "";
  const lines = items.slice(0, 5).map(n => `- [${n.source}] ${n.title}`).join("\n");
  return `[BERITA TERBARU - mode ${tab}]\n${lines}\n\n`;
}

// Shortcut command "/forex", "/crypto", dst yang muncul di popover saat user
// mulai ngetik "/" di kotak input. Konstanta statis -> ditaruh di module
// scope (bukan di dalam komponen) supaya tidak dialokasikan ulang tiap render.
export const CHAT_SHORTCUTS = [
  { cmd: "/stock", desc: "stocks" },
  { cmd: "/etf", desc: "ETFs & funds" },
  { cmd: "/bond", desc: "bonds" },
  { cmd: "/crypto", desc: "crypto" },
  { cmd: "/index", desc: "indices" },
  { cmd: "/portfolio", desc: "portfolio" },
  { cmd: "/forex", desc: "forex pairs" },
  { cmd: "/futures", desc: "futures" },
  { cmd: "/watchlist", desc: "watchlist" },
];

// Template pertanyaan di landing view. Sama seperti CHAT_SHORTCUTS -- statis,
// tidak bergantung state/props apa pun, jadi aman di module scope.
export const CHAT_TEMPLATES = [
  {
    title: "Crypto & Digital Assets",
    desc: "Analyze Bitcoin post-halving cycle, ETF flows, and institutional adoption trends"
  },
  {
    title: "Dollar Decline & FX Strategy",
    desc: "Assess the weakening US dollar thesis and currency hedging opportunities"
  },
  {
    title: "S&P 500 Sector Rotation",
    desc: "Identify overweight and underweight sectors based on the macro cycle and earnings momentum"
  },
  {
    title: "Fed Rate Path & Fixed Income",
    desc: "Evaluate the Fed's rate cut trajectory, bond supply dynamics, and fixed income positioning"
  }
];
