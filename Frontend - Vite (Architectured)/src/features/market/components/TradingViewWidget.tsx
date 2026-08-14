// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

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

    let loadTimeout: NodeJS.Timeout | undefined;

    // Small delay untuk avoid race condition saat rapid symbol changes
    const timeoutId = setTimeout(() => {
      if (!mountedRef.current) return;

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

      if (window.TradingView) {
        setIsLoading(false);
        initWidget();
        return;
      }

      const script = document.createElement("script");
      script.type = "text/javascript";
      script.src = "https://s3.tradingview.com/tv.js";
      script.async = true;

      script.onload = () => {
        scriptLoadedRef.current = true;
        if (mountedRef.current) {
          setIsLoading(false);
          initWidget();
        }
        if (loadTimeout) clearTimeout(loadTimeout);
      };

      script.onerror = () => {
        if (mountedRef.current) {
          setError("TradingView widget gagal dimuat");
          setIsLoading(false);
          onError?.();
        }
        if (loadTimeout) clearTimeout(loadTimeout);
      };

      // Timeout fallback: kalau 10 detik script belum onload, anggap failed
      loadTimeout = setTimeout(() => {
        if (!scriptLoadedRef.current && mountedRef.current) {
          setError("TradingView widget timeout");
          setIsLoading(false);
          onError?.();
        }
      }, 10000);

      document.head.appendChild(script);
    }, 150); // 150ms debounce untuk avoid rapid remount

    return () => {
      clearTimeout(timeoutId);
      if (loadTimeout) clearTimeout(loadTimeout);
      // Only cleanup if script was loaded to avoid cutting off initialization
      if (scriptLoadedRef.current && container) {
        container.innerHTML = "";
      }
    };
  }, [symbol, theme, interval, chartStyle, hideVolume, hideTopToolbar, JSON.stringify(studies), retryCount, onError]);

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
