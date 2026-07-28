import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { TerminalShell } from "../components/layout/TerminalShell";
import { LightweightChartWidget } from "../components/analysis/LightweightChartWidget";
import { StrategyPanel, type AnalysisRequest } from "../components/analysis/StrategyPanel";
import { SignalResultCard, type SignalResult } from "../components/analysis/SignalResultCard";

const CHART_TIMEFRAMES: Array<{ label: string; value: "M15" | "H1" | "H4" | "D1" }> = [
  { label: "M15", value: "M15" },
  { label: "H1", value: "H1" },
  { label: "H4", value: "H4" },
  { label: "D1", value: "D1" },
];

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
    setSignal(null);
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

      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: The Chart Laboratory */}
        <div className="flex flex-1 flex-col border-r border-[var(--border)]">
          <div id="panel-chart" className="flex items-stretch border-b border-[var(--border)] bg-[var(--surface-alt)]">
            <div className="border-r border-[var(--border)] px-4 py-2 text-[14px] font-bold text-[var(--accent)]">
              {symbol}
            </div>
            <div className="flex">
              {CHART_TIMEFRAMES.map((tf) => (
                <button
                  key={tf.value}
                  onClick={() => setChartInterval(tf.value)}
                  className={
                    "border-r border-[var(--border)] px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors " +
                    (chartInterval === tf.value
                      ? "bg-[var(--accent)] text-[var(--bg)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]")
                  }
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1">
            <LightweightChartWidget symbol={symbol} timeframe={chartInterval} />
          </div>
        </div>

        {/* Right Column: AI Control Panel */}
        <div className="flex w-[380px] flex-col overflow-y-auto bg-[var(--surface)]">
          <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface-alt)] px-4 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              AI Command Center
            </span>
          </div>

          <div id="panel-strategy" className="p-0">
            <StrategyPanel symbol={symbol} onGenerate={handleGenerate} isGenerating={isGenerating} />
          </div>

          {error && (
            <div className="mx-4 mb-4 border-l-2 border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2.5 text-[11px] text-[var(--danger)]">
              {error}
            </div>
          )}

          {signal && (
            <div className="p-4 pt-0">
              <SignalResultCard signal={signal} />
            </div>
          )}
        </div>
      </div>
    </TerminalShell>
  );
}
