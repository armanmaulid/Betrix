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

// Command instrumen yang men-trigger fetch data realtime MT5. Simbol diambil
// dari kata setelah command, mis. "/forex xauusd analisa ..." -> symbol=XAUUSD.
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

// Satu-satunya sumber kebenaran pemetaan command→kategori broker. Kategori
// broker = turunan `path` MT5 (top-level segment), nilai aktual (17 Aug 2026):
//   "Stock CFD's", "Crypto", "Forex", "Commodities", "Indices", "Bonds CFDs"
// plus sub-segment khusus: "ETF" (di Stock CFD's), "Futures" (Energies/Metal/
// Indices Futures). Mapping ini dipakai ChatCommandBox (popover filter) supaya
// tidak ada duplikasi kategori hardcode yang bisa drift dari broker asli.
// ponytail: Commodities spot (Metals/Softs/Energies spot, mis. XAUUSD) belum
// punya command khusus — user saat ini menganalisa metal lewat default symbol
// / tombol "ANALISA SEKARANG", bukan slash command. Tambah `/commodity` kalau
// butuh.
export function symbolMatchesCommand(path: string, cmd: string): boolean {
  const p = (path || "").toLowerCase();
  const top = p.split("\\")[0] || "";

  switch (cmd) {
    case "forex": return top === "forex";
    case "crypto": return top === "crypto";
    case "stock": return top === "stock cfd's" && !p.includes("etf");
    case "etf": return p.includes("etf");
    case "bond": return top === "bonds cfds" || top === "bonds";
    case "index": return top === "indices" && !p.includes("futures");
    case "futures": return p.includes("futures");
    default: return false;
  }
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

// Pemetaan tab chat → asset berita. Berita TIDAK lagi di-fetch di frontend —
// tab ini cuma diterjemahkan jadi `contextParams.news_context.assets` yang
// dikirim ke backend, lalu backend sendiri yang mengambil berita & menyusun
// konteksnya (lihat docs/backend-prompt-migration-response.md §3.2).
// AUTO sengaja tidak dipetakan = tidak ada injeksi berita.
export const TAB_TO_NEWS_ASSETS: Record<string, string[] | undefined> = {
  AUTO: undefined,
  EQUITY: ["global"],
  MACRO: ["eco"],
  NEWS: ["usd", "metal", "oil", "btc"],
};

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
