import { useEffect, useRef, useState } from "react";
import { init, dispose, type Chart, type Period } from "klinecharts";
import { AlertTriangle, Loader2 } from "lucide-react";
import { fetchCandles } from "../../api/marketClient";

interface KLineChartWidgetProps {
  symbol: string; // MT5 symbol name exactly as it appears in Market Watch, e.g. "EURUSD"
  timeframe: "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1";
}

// Maps our simple timeframe codes to KLineChart's { type, span } Period shape.
const PERIOD_MAP: Record<string, Period> = {
  M1: { type: "minute", span: 1},
  M5: { type: "minute", span: 5},
  M15: { type: "minute", span: 15 },
  M30: { type: "minute", span: 30},
  H1: { type: "hour", span: 1 },
  H4: { type: "hour", span: 4 },
  D1: { type: "day", span: 1 },
};

// Reverse of PERIOD_MAP — needed inside the data loader callback, which
// receives a KLineChart Period object and has to translate it back into
// the timeframe string our mt5-bridge REST API expects.
function periodToTimeframe(period: Period): string {
  const match = Object.entries(PERIOD_MAP).find(
    ([, p]) => p.type === period.type && p.span === period.span
  );
  return match ? match[0] : "M15";
}

// Renders candles pulled from the local MT5 bridge (see /mt5-bridge) using
// KLineChart v10's pull-based data-loader model (setDataLoader / getBars —
// NOT the applyNewData API from older KLineChart versions; verified against
// the actual installed v10 type declarations before writing this).
//
// Chosen over the earlier TradingView widget specifically so entry/SL/TP/
// alternative-entry lines can be drawn directly on the chart later via
// chart.createOverlay(...) — the free TradingView widget doesn't allow
// that without their paid SDK. That drawing logic isn't wired up yet; this
// component only renders candles for now.
export function KLineChartWidget({ symbol, timeframe }: KLineChartWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Init the chart + data loader once per mount. KLineChart calls getBars
  // automatically whenever setSymbol/setPeriod changes (see the effect
  // below) — we never call fetchCandles directly from here.
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = init(containerRef.current, {
      styles: {
        candle: {
          bar: {
            upColor: "#4fbf8b",
            downColor: "#e85d5d",
            upBorderColor: "#4fbf8b",
            downBorderColor: "#e85d5d",
            upWickColor: "#4fbf8b",
            downWickColor: "#e85d5d",
          },
        },
        grid: {
          horizontal: { color: "#2c2836" },
          vertical: { color: "#2c2836" },
        },
      },
    });

    if (!chart) return;
    chartRef.current = chart;

    chart.setDataLoader({
      getBars: async ({ symbol: sym, period, callback }) => {
        setIsLoading(true);
        setError(null);
        try {
          const tf = periodToTimeframe(period);
          const candles = await fetchCandles(sym.ticker, tf, 200);
          callback(
            candles.map((c) => ({
              timestamp: c.time * 1000,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
            })),
            false // no backward-pagination wired up yet
          );
        } catch (err) {
          setError(
            err instanceof Error
              ? `${err.message} — cek mt5-bridge & MT5 terminal jalan (lihat mt5-bridge/README.md)`
              : "Gagal memuat candle dari MT5 bridge"
          );
          callback([], false);
        } finally {
          setIsLoading(false);
        }
      },
    });

    return () => {
      if (containerRef.current) dispose(containerRef.current);
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push symbol/timeframe changes into the chart — this is what actually
  // triggers getBars above (with type: "init") each time either changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setSymbol({ ticker: symbol, pricePrecision: 5, volumePrecision: 0 });
    chart.setPeriod(PERIOD_MAP[timeframe] ?? PERIOD_MAP.M15);
  }, [symbol, timeframe]);

  return (
    <div className="relative h-full w-full bg-[var(--surface)]">
      <div ref={containerRef} className="h-full w-full" />
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--surface)]/70">
          <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--surface)] p-4 text-center">
          <AlertTriangle size={20} className="text-[var(--danger)]" />
          <p className="max-w-sm text-sm text-[var(--danger)]">{error}</p>
        </div>
      )}
    </div>
  );
}
