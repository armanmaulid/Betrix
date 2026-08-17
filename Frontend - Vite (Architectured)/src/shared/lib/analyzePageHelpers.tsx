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

// Satu-satunya sumber kebenaran pemetaan command→kategori broker. Kategori
// broker = turunan `path` MT5 (top-level segment), nilai aktual (17 Aug 2026):
//   "Stock CFD's", "Crypto", "Forex", "Commodities", "Indices", "Bonds CFDs"
// plus sub-segment khusus: "ETF" (di Stock CFD's), "Futures" (Energies/Metal/
// Indices Futures). `deriveCommands` memotong daftar ini ke kategori yang
// benar-benar punya simbol di broker — command yang muncul di UI TIDAK lagi
// hardcoded, tapi turun dari `GET /api/v1/market/symbols`.
interface CommandDefinition {
  slug: string;
  label: string;
  matches: (path: string) => boolean;
}

const topCategory = (path: string) => (path || "").toLowerCase().split("\\")[0] || "";

export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  { slug: "forex",     label: "forex pairs",  matches: (p) => topCategory(p) === "forex" },
  { slug: "crypto",    label: "crypto",       matches: (p) => topCategory(p) === "crypto" },
  { slug: "stock",     label: "stocks",       matches: (p) => topCategory(p) === "stock cfd's" && !p.includes("etf") },
  { slug: "etf",       label: "ETFs & funds", matches: (p) => p.includes("etf") },
  { slug: "bond",      label: "bonds",        matches: (p) => topCategory(p) === "bonds cfds" || topCategory(p) === "bonds" },
  { slug: "index",     label: "indices",      matches: (p) => topCategory(p) === "indices" && !p.includes("futures") },
  { slug: "futures",   label: "futures",      matches: (p) => p.includes("futures") },
  { slug: "commodity", label: "commodities",  matches: (p) => topCategory(p) === "commodities" },
];

// Command instrumen yang men-trigger fetch data realtime MT5. Simbol diambil
// dari kata setelah command, mis. "/forex xauusd analisa ..." -> symbol=XAUUSD.
export const INSTRUMENT_COMMANDS = COMMAND_DEFINITIONS.map((d) => d.slug);
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

export function symbolMatchesCommand(path: string, cmd: string): boolean {
  const def = COMMAND_DEFINITIONS.find((d) => d.slug === cmd.toLowerCase());
  return def ? def.matches(path) : false;
}

// Command yang tampil di popover + landing view: turun dari simbol broker
// (kategori yang benar-benar ada), BUKAN daftar hardcode. Kalau `symbols`
// kosong (masih loading / fetch gagal), fallback ke seluruh definisi supaya
// UI tidak kosong.
export interface CommandShortcut {
  cmd: string;
  desc: string;
}

export function deriveCommands(symbols: { path?: string | null }[]): CommandShortcut[] {
  const defs = symbols.length === 0
    ? COMMAND_DEFINITIONS
    : COMMAND_DEFINITIONS.filter((d) => symbols.some((s) => d.matches(s.path || "")));
  return defs.map((d) => ({ cmd: `/${d.slug}`, desc: d.label }));
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
// mulai ngetik "/" di kotak input. DIPERTAHANKAN demi backward compat impor
// lama; konsumen baru pakai `deriveCommands(symbols)` yang derive dari broker.
// `/portfolio` + `/watchlist` (bukan instrument command, tak ada handler)
// sengaja dihapus.
export const CHAT_SHORTCUTS: CommandShortcut[] = COMMAND_DEFINITIONS.map((d) => ({
  cmd: `/${d.slug}`,
  desc: d.label,
}));

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
