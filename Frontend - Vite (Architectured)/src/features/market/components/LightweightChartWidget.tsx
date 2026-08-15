import { useEffect, useRef, useState } from "react";
import { createChart, IChartApi, ISeriesApi, Time, ColorType, CandlestickSeries } from "lightweight-charts";
import { AlertTriangle, Loader2 } from "lucide-react";
import { fetchOHLC } from "../api/marketClient";
import { useTickerPrices } from "../hooks/useTickerPrices";

interface LightweightChartWidgetProps {
  symbol: string;
  timeframe: "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1";
}

export function LightweightChartWidget({ symbol, timeframe }: LightweightChartWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastCandleRef = useRef<{ time: Time; open: number; high: number; low: number; close: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#000000" }, // matches var(--bg) or surface
        textColor: "var(--text-label)", // matches var(--text-muted) or accent
        fontFamily: "'Inter', sans-serif",
      },
      grid: {
        vertLines: { color: "#2c2836" },
        horzLines: { color: "#2c2836" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true, // Auto resizes chart with container
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#4fbf8b",
      downColor: "#e85d5d",
      borderVisible: false,
      wickUpColor: "#4fbf8b",
      wickDownColor: "#e85d5d",
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    return () => {
      chart.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    async function loadData() {
      if (!seriesRef.current) return;
      setIsLoading(true);
      setError(null);
      
      try {
        const result = await fetchOHLC(symbol, timeframe, abortController.signal);
        if (cancelled) return;

        const candles = result?.candles ?? [];
        const data = candles
          .map((c) => ({
            time: c.time as Time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
          .sort((a, b) => (a.time as number) - (b.time as number));

        // Lightweight-charts akan crash jika ada duplicate time
        const uniqueData = data.filter((v, i, a) => i === 0 || v.time !== a[i - 1].time);
        
        seriesRef.current.setData(uniqueData);
        if (uniqueData.length > 0) {
          lastCandleRef.current = uniqueData[uniqueData.length - 1];
        }
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === "AbortError")) return;
        setError(
          err instanceof Error
            ? `${err.message} - cek mt5-bridge & MT5 terminal jalan`
            : "Gagal memuat candle dari MT5 bridge"
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadData();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [symbol, timeframe]);

  // Hook up real-time SSE updates
  const tickerPrices = useTickerPrices([{ symbol, label: symbol, decimals: 5 }]);
  const livePrice = tickerPrices[symbol]?.price;

function getTimeframeSeconds(tf: string): number {
  switch (tf) {
    case "M1": return 60;
    case "M5": return 300;
    case "M15": return 900;
    case "M30": return 1800;
    case "H1": return 3600;
    case "H4": return 14400;
    case "D1": return 86400;
    default: return 60;
  }
}

  useEffect(() => {
    if (!seriesRef.current || !lastCandleRef.current || !livePrice) return;
    
    const last = lastCandleRef.current;
    const tfSeconds = getTimeframeSeconds(timeframe);
    const nowSecs = Math.floor(Date.now() / 1000);
    const bucketStart = (Math.floor(nowSecs / tfSeconds) * tfSeconds) as Time;

    if (bucketStart === last.time) {
      const updatedCandle = {
        ...last,
        close: livePrice,
        high: Math.max(last.high, livePrice),
        low: Math.min(last.low, livePrice)
      };
      
      lastCandleRef.current = updatedCandle;
      seriesRef.current.update(updatedCandle);
    } else if ((bucketStart as number) > (last.time as number)) {
      const newCandle = {
        time: bucketStart,
        open: last.close, // smooth transition from previous candle
        high: Math.max(last.close, livePrice),
        low: Math.min(last.close, livePrice),
        close: livePrice
      };
      
      lastCandleRef.current = newCandle;
      seriesRef.current.update(newCandle);
    }
  }, [livePrice, timeframe]);

  return (
    <div className="relative h-full w-full bg-[#050505]">
      <div ref={containerRef} className="absolute inset-0" />
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--surface)]/70 z-10">
          <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--surface)] p-4 text-center z-10">
          <AlertTriangle size={20} className="text-[var(--danger)]" />
          <p className="max-w-sm text-sm text-[var(--danger)]">{error}</p>
        </div>
      )}
    </div>
  );
}

