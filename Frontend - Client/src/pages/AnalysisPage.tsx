import { useState } from "react";
import { TickerStrip } from "../components/analysis/TickerStrip";
import { KLineChartWidget } from "../components/analysis/KLineChartWidget";
import { StrategyPanel, type AnalysisRequest } from "../components/analysis/StrategyPanel";
import { SignalResultCard, type SignalResult } from "../components/analysis/SignalResultCard";
import { NewsFeed } from "../components/analysis/NewsFeed";
import { EconomicCalendar } from "../components/analysis/EconomicCalendar";
import { TopBar } from "../components/layout/TopBar";
import { SideNavRail } from "../components/layout/SideNavRail";
import { StatusBar } from "../components/layout/StatusBar";
import { useAuth } from "../context/AuthContext";

// MT5 symbol names — plain, no broker/exchange prefix (unlike the old
// TradingView format "OANDA:EURUSD"). These are generic defaults; your
// broker may use suffixes like "EURUSD.a" or "EURUSDm". Check the exact
// name in your MT5 Market Watch, or call the bridge's GET /symbols
// endpoint (see mt5-bridge/README.md) if a symbol 404s.
const SYMBOLS = [
  { label: "EUR/USD", value: "EURUSD" },
  { label: "GBP/USD", value: "GBPUSD" },
  { label: "XAU/USD", value: "XAUUSD" },
  { label: "USD/JPY", value: "USDJPY" },
];

// Chart display timeframe — what's actually rendered on the candle chart.
// Separate from the "Timeframe Analisa" checkboxes in StrategyPanel, which
// tell the AI which timeframes to factor into its reasoning.
const CHART_TIMEFRAMES: Array<{ label: string; value: "M15" | "H1" | "H4" | "D1" }> = [
  { label: "M15", value: "M15" },
  { label: "H1", value: "H1" },
  { label: "H4", value: "H4" },
  { label: "D1", value: "D1" },
];

// TODO: swap for the real analysis endpoint once it exists. Kept as a
// standalone async function (not inline) so wiring a real `apiClient.post`
// call later is a one-line change at the call site below.
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

// Full terminal shell (Bloomberg-terminal-inspired): top function-key bar +
// live ticker marquee, left icon rail, scrollable main column, right info
// column (news/watchlist/calendar), bottom status bar. Where a Bloomberg
// dashboard puts an AI "command" / chat prompt box front-and-center, this
// app puts the chart there instead — StrategyPanel below it is the actual
// AI trigger (generates a trade signal, not a freeform chat).
export function AnalysisPage() {
  const { user } = useAuth();
  const [symbol, setSymbol] = useState(SYMBOLS[0].value);
  const [chartInterval, setChartInterval] = useState(CHART_TIMEFRAMES[1].value);
  const [signal, setSignal] = useState<SignalResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(request: AnalysisRequest) {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await mockGenerateAnalysis(request);
      setSignal(result);
    } catch (err) {
      setError("Gagal generate analisa. Coba lagi.");
    } finally {
      setIsGenerating(false);
    }
  }

  // Dipakai TopBar (search box) buat lompat langsung ke simbol arbitrary,
  // bukan cuma 4 pilihan di dropdown SYMBOLS.
  function handleSearchSymbol(rawSymbol: string) {
    setSymbol(rawSymbol);
  }

  const displaySymbol = SYMBOLS.find((s) => s.value === symbol)?.label ?? symbol;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg)] font-mono text-[13px] text-[var(--text-primary)]">
      <TopBar onSearchSymbol={handleSearchSymbol} />
      <TickerStrip />

      <div className="flex flex-1 overflow-hidden">
        <SideNavRail />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col overflow-y-auto">
            <div id="panel-dashboard" className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              <p className="text-[13px]">
                👋 Hai <span className="font-bold text-[var(--accent)]">{user?.name || user?.email}</span>, yuk cek
                pergerakan market hari ini.
              </p>
            </div>

            <div
              id="panel-chart"
              className="flex items-stretch border-b border-[var(--border)] bg-[var(--surface)]"
            >
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="border-r border-[var(--border)] bg-transparent px-3.5 py-2 text-[13px] font-bold text-[var(--accent)] outline-none"
              >
                {SYMBOLS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
                {!SYMBOLS.some((s) => s.value === symbol) && <option value={symbol}>{symbol}</option>}
              </select>
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
              <div className="ml-auto flex items-center px-3.5 text-[11px] text-[var(--text-muted)]">
                {displaySymbol}
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
          </div>

          <div className="hidden w-[300px] flex-shrink-0 flex-col overflow-y-auto border-l border-[var(--border)] xl:flex">
            <div id="panel-news">
              <NewsFeed />
            </div>
            <div id="panel-calendar">
              <EconomicCalendar />
            </div>
          </div>
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
