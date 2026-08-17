import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

// Minimal typing untuk API embed TradingView (s3.tradingview.com/tv.js).
// Tv.js sendiri untyped (global script), jadi kita definisikan bagian yang
// dipakai saja — sisanya (events, getWidget, dst) tidak kita sentuh.
interface TradingViewWidgetConfig {
  autosize: boolean;
  symbol: string;
  interval: string;
  timezone: string;
  theme: string;
  style: string;
  locale: string;
  enable_publishing: boolean;
  allow_symbol_change: boolean;
  hide_side_toolbar: boolean;
  hide_top_toolbar: boolean;
  hide_volume: boolean;
  studies?: string[];
  container_id: string;
}

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: TradingViewWidgetConfig) => unknown;
    };
  }
}

interface TradingViewWidgetProps {
  symbol: string; // Format TradingView, mis. "OANDA:XAUUSD" — lihat lib/tradingViewSymbols.ts
  theme?: "dark" | "light";
  interval?: string; // Timeframe default, mis. "15" untuk 15m, "D" untuk Daily
  chartStyle?: string; // "1" untuk Candles, "2" untuk Line, "3" untuk Area
  hideVolume?: boolean; // Menyembunyikan indikator volume bawaan
  hideTopToolbar?: boolean; // Menyembunyikan toolbar atas (timeframe, dll)
  studies?: string[]; // Daftar indikator (e.g., ["RSI@tv-basicstudies"])
  onError?: () => void; // Callback saat widget fail, parent bisa switch ke fallback chart
}

// Module-level: s3.tradingview.com/tv.js is a global library — load it at
// most ONCE per page load. Every widget instance only needs to re-run
// initWidget() once the script is available; appending a fresh <script> per
// mount (or per symbol switch) leaked one tag each time. Reset the promise on
// failure so the retry button can attempt a fresh load.
let tradingViewScriptPromise: Promise<void> | null = null;

function ensureTradingViewScript(): Promise<void> {
  if (window.TradingView) return Promise.resolve();
  if (tradingViewScriptPromise) return tradingViewScriptPromise;

  tradingViewScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("TradingView script failed to load"));
    document.head.appendChild(script);
  }).catch((err) => {
    // Allow a later mount (or retry) to attempt a fresh load.
    tradingViewScriptPromise = null;
    throw err;
  });

  return tradingViewScriptPromise;
}

// Widget resmi TradingView (Advanced Real-Time Chart) — GRATIS, embed
// publik, tidak butuh akun/API key. Beban render & data sepenuhnya
// ditanggung infra TradingView, jadi aman dibuka ratusan orang bersamaan
// tanpa nyentuh mt5-bridge sama sekali.
//
// Timeframe SUDAH built-in di toolbar bawah widget-nya sendiri
// (1m/5m/15m/1H/4H/1D/1W/1M dst — semua tersedia otomatis, tidak di-hide),
// makanya komponen ini sengaja tidak punya prop timeframe terpisah seperti
// KLineChartWidget.
//
// Cara kerja teknisnya: skrip embed TradingView baca config JSON yang
// ditaruh sebagai TEXT CONTENT di dalam tag <script> itu sendiri (bukan
// lewat JS API biasa), lalu merender widget ke container di sebelahnya.
// Konsekuensinya: TradingView tidak menyediakan cara "update props" tanpa
// remount penuh, jadi tiap kali `symbol` berubah, container dikosongkan
// total dan skrip baru di-mount ulang dari nol.
export function TradingViewWidget({ symbol, theme = "dark", interval = "15", chartStyle = "1", hideVolume = false, hideTopToolbar = false, studies = [], onError }: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scriptLoadedRef = useRef(false);
  const mountedRef = useRef(true);
  const onErrorRef = useRef(onError);
  // Keep the latest onError in a ref so the main effect below doesn't need it
  // in its dependency array — an inline arrow from a parent would otherwise
  // remount the whole widget on every parent render.
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setIsLoading(true);
    setError(null);
    scriptLoadedRef.current = false;

    let cancelled = false;
    let loadTimeout: ReturnType<typeof setTimeout> | undefined;

    // Small delay untuk avoid race condition saat rapid symbol changes
    const timeoutId = setTimeout(() => {
      if (cancelled || !mountedRef.current) return;

      container.innerHTML = "";

      // Membuat ID unik untuk container
      const containerId = "tv_chart_" + Math.random().toString(36).substring(2, 9);
      container.id = containerId;

      const initWidget = () => {
        if (window.TradingView) {
          new window.TradingView.widget({
            autosize: true,
            symbol,
            interval,
            timezone: "Etc/UTC",
            theme,
            style: chartStyle,
            locale: "en",
            enable_publishing: false,
            allow_symbol_change: false,
            hide_side_toolbar: true,
            hide_top_toolbar: hideTopToolbar,
            hide_volume: hideVolume,
            studies: studies.length > 0 ? studies : undefined,
            container_id: containerId,
          });
        }
      };

      const failWidget = (message: string) => {
        if (loadTimeout) clearTimeout(loadTimeout);
        // Reset the shared script promise so a retry can attempt a fresh load.
        tradingViewScriptPromise = null;
        if (cancelled || !mountedRef.current) return;
        setError(message);
        setIsLoading(false);
        onErrorRef.current?.();
      };

      if (window.TradingView) {
        setIsLoading(false);
        initWidget();
        return;
      }

      // Timeout fallback: kalau 10 detik script belum onload, anggap failed
      loadTimeout = setTimeout(() => {
        if (!scriptLoadedRef.current) {
          failWidget("TradingView widget timeout");
        }
      }, 10000);

      ensureTradingViewScript()
        .then(() => {
          if (cancelled || !mountedRef.current) return;
          scriptLoadedRef.current = true;
          setIsLoading(false);
          initWidget();
          if (loadTimeout) clearTimeout(loadTimeout);
        })
        .catch(() => {
          failWidget("TradingView widget gagal dimuat");
        });
    }, 150); // 150ms debounce untuk avoid rapid remount

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (loadTimeout) clearTimeout(loadTimeout);
      // Only cleanup if script was loaded to avoid cutting off initialization
      if (scriptLoadedRef.current && container) {
        container.innerHTML = "";
      }
    };
  }, [symbol, theme, interval, chartStyle, hideVolume, hideTopToolbar, JSON.stringify(studies), retryCount]);

  return (
    <div className="relative h-full w-full">
      <div className="tradingview-widget-container h-full w-full" ref={containerRef} />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface)] text-[11px] text-[var(--text-muted)]">
          <div className="flex flex-col items-center gap-2">
            <div className="h-4 w-4 animate-spin border-2 border-[var(--accent)] border-t-transparent" />
            <span>Loading chart...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--surface)] text-[11px]">
          <div className="text-[var(--danger)]">{error}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setError(null);
                setRetryCount((c) => c + 1);
              }}
              className="flex items-center gap-1.5 border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[10px] font-semibold text-[#050505] hover:brightness-110"
            >
              <RefreshCw size={12} />
              Coba Lagi
            </button>
            {onError && (
              <button
                onClick={onError}
                className="border border-[var(--border)] px-3 py-1.5 text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--accent)]"
              >
                Pakai Chart MT5
              </button>
            )}
          </div>
          <div className="max-w-xs text-center text-[9px] text-[var(--text-muted)]">
            TradingView mungkin membatasi reload. Tunggu beberapa detik atau gunakan chart MT5 bridge.
          </div>
        </div>
      )}
    </div>
  );
}
