import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { TerminalShell } from "../components/layout/TerminalShell";
import { KLineChartWidget } from "../components/analysis/KLineChartWidget";
import { StrategyPanel, type AnalysisRequest } from "../components/analysis/StrategyPanel";
import { SignalResultCard, type SignalResult } from "../components/analysis/SignalResultCard";

const CHART_TIMEFRAMES: Array<{ label: string; value: "M15" | "H1" | "H4" | "D1" }> = [
  { label: "M15", value: "M15" },
  { label: "H1", value: "H1" },
  { label: "H4", value: "H4" },
  { label: "D1", value: "D1" },
];

// TODO: swap for the real analysis endpoint once it exists.
async function mockGenerateAnalysis(request: AnalysisRequest): Promise<SignalResult> {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return {
    direction: "buy",
    entry: 1.085,
    sl: 1.082,
    tp: 1.092,
    riskReward: 2.3,
    confidence: 74,
    reasoning: `Analisa berdasarkan strategi ${request.strategies.join(", ")} pada timeframe ${request.timeframes.join(
      "+"
    )}: struktur harga menunjukkan higher-low di area demand, momentum mendukung kelanjutan uptrend.`,
    alternative: {
      direction: "sell",
      entry: 1.087,
      sl: 1.09,
      tp: 1.081,
      condition: "Break & close di bawah 1.0870 pada H1",
    },
  };
}

// Halaman khusus analisa AI — dibuka dari tombol "Analisa Sekarang" di
// DashboardPage (simbol yang lagi dilihat ikut dibawa lewat ?symbol=...).
// Beda sengaja dari DashboardPage: chart di sini KLineChart yang datanya
// LANGSUNG dari mt5-bridge kamu sendiri, bukan TradingView — karena inilah
// data yang harus persis sama dengan yang dipakai AI buat menghitung
// Entry/SL/TP, bukan feed generik pihak ketiga. Traffic ke halaman ini
// jauh lebih jarang daripada Dashboard (orang klik dulu, bukan otomatis
// kebuka), jadi beban ke mt5-bridge tetap terkendali.
export function AnalyzePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSymbol = searchParams.get("symbol") || "XAUUSD";

  const [symbol, setSymbol] = useState(initialSymbol);
  const [chartInterval, setChartInterval] = useState<(typeof CHART_TIMEFRAMES)[number]["value"]>("H1");
  const [signal, setSignal] = useState<SignalResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(request: AnalysisRequest) {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await mockGenerateAnalysis(request);
      setSignal(result);
    } catch {
      setError("Gagal generate analisa. Coba lagi.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleSearchSymbol(rawSymbol: string) {
    setSymbol(rawSymbol);
    setSignal(null); // sinyal lama nggak relevan lagi buat simbol baru
  }

  return (
    <TerminalShell onSearchSymbol={handleSearchSymbol}>
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2.5">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={13} />
          Dashboard
        </button>
        <span className="text-[11px] text-[var(--text-muted)]">/</span>
        <span className="text-[11px] font-bold text-[var(--accent)]">Analisa AI — {symbol}</span>
      </div>

      <div id="panel-chart" className="flex items-stretch border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="border-r border-[var(--border)] px-3.5 py-2 text-[13px] font-bold text-[var(--accent)]">
          {symbol}
        </div>
        <div className="flex">
          {CHART_TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setChartInterval(tf.value)}
              className={
                "border-r border-[var(--border)] px-3.5 py-2 text-xs " +
                (chartInterval === tf.value
                  ? "bg-[var(--accent)] font-bold text-[var(--bg)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]")
              }
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[420px] border-b border-[var(--border)]">
        <KLineChartWidget symbol={symbol} timeframe={chartInterval} />
      </div>

      <div id="panel-strategy">
        <StrategyPanel symbol={symbol} onGenerate={handleGenerate} isGenerating={isGenerating} />
      </div>

      {error && (
        <div className="border-b border-[var(--border)] bg-[var(--danger-soft)] px-4 py-2.5 text-[12px] text-[var(--danger)]">
          {error}
        </div>
      )}

      {signal && <SignalResultCard signal={signal} />}
    </TerminalShell>
  );
}
