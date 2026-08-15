import React, { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../features/auth/context/AuthContext";
import { Maximize2, Search, Zap } from "lucide-react";

const FUNCTION_TABS = [
  { key: "F1", label: "DASHBOARD", to: "/" },
  { key: "F2", label: "ANALISA AI", to: "/analyze" },
  { key: "F3", label: "NEWS", to: "/news" },
];

interface TopBarProps {
  onSearchSymbol: (symbol: string) => void;
}

// Dua tab function-key ini navigasi HALAMAN BENERAN sekarang (bukan
// scroll-anchor satu halaman lagi) — DashboardPage (chart TradingView
// publik) dan AnalyzePage (KLineChart + StrategyPanel + hasil sinyal AI).
// Search box juga beneran: submit → set symbol di halaman aktif.
//
// NOTE: indikator "LIVE" cuma ada DI SINI (sejajar jam), TIDAK ada lagi di
// TickerStrip — sebelumnya sempat ada di dua tempat sekaligus (dobel).
export const TopBar = React.memo(function TopBar({ onSearchSymbol }: TopBarProps) {
  const [now, setNow] = useState(new Date());
  const [query, setQuery] = useState("");
  const { user, isConnected } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const symbol = query.trim().toUpperCase();
    if (!symbol) return;
    onSearchSymbol(symbol);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  return (
    <div className="flex items-stretch border-b border-[var(--border)] bg-[var(--surface)] text-[11px]">
      <div className="flex flex-shrink-0 items-stretch overflow-x-auto">
        {FUNCTION_TABS.map((t) => {
          const isActive = location.pathname === t.to;
          return (
            <button
              key={t.key}
              onClick={() => navigate(t.to)}
              className={`btn-sweep bx-nav-tab ${isActive ? "bx-nav-tab-active" : ""}`}
            >
              <span className="bx-nav-tab-key">{t.key}</span>
              <span className="bx-nav-tab-label">{t.label}</span>
            </button>
          );
        })}
      </div>

      <form
        onSubmit={handleSearchSubmit}
        className="mx-3 my-1.5 flex flex-1 items-center gap-2 border border-[var(--border)] bg-[var(--surface-alt)] px-2"
      >
        <Search size={12} className="flex-shrink-0 text-[var(--text-muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="CARI SIMBOL, MIS. XAUUSD"
          className="w-full min-w-0 bg-transparent text-[11px] uppercase tracking-wide text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
        <button
          type="submit"
          className="btn-sweep flex-shrink-0 bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-[var(--bg)] hover:opacity-90"
        >
          GO
        </button>
      </form>

      <div
        className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 border-l border-[var(--border)] px-3 text-[10px] transition-colors hover:bg-[var(--surface-alt)]"
        title="Sisa AI Credits"
      >
        <Zap size={12} className={user?.credits && user.credits > 0 ? "text-[var(--caution)]" : "text-[var(--danger)]"} />
        <span className="text-[var(--text-label)]">CREDITS: <span className="font-bold text-[var(--text-primary)]">{user?.credits !== undefined ? user.credits : "--"}</span></span>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1.5 border-l border-[var(--border)] px-3 text-[10px]">
        <span className="text-[var(--text-label)]">API: <span className={`font-bold ${import.meta.env.DEV ? "text-[var(--caution)]" : "text-[var(--success)]"}`}>{import.meta.env.DEV ? "DEVELOPMENT" : "OPERATIONAL"}</span> <span className="text-[var(--text-muted)]">v0.1</span></span>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1.5 border-l border-[var(--border)] px-3 text-[10px]">
        <span className="text-[var(--text-label)]">CONN:</span>
        <span className={`flex items-center gap-1.5 font-bold ${isConnected ? "text-[var(--success)]" : "text-[var(--caution)]"}`}>
          <span className="relative flex h-1.5 w-1.5">
            {isConnected && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--success)] opacity-75" />
            )}
            <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${isConnected ? "bg-[var(--success)]" : "bg-[var(--caution)]"}`} />
          </span>
          {isConnected ? "LIVE" : "RECONNECTING"}
        </span>
      </div>

      <button
        onClick={toggleFullscreen}
        aria-label="Fullscreen"
        className="btn-sweep flex-shrink-0 border-l border-[var(--border)] px-3 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <Maximize2 size={13} />
      </button>

      <div className="flex flex-shrink-0 items-center border-l border-[var(--border)] px-3 text-[11px] font-bold text-[var(--accent)]">
        <span className="tabular">
          {now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}{" "}
          {(() => {
            const offsetMin = -now.getTimezoneOffset();
            const hrs = Math.floor(Math.abs(offsetMin) / 60);
            const mins = Math.abs(offsetMin) % 60;
            const sign = offsetMin >= 0 ? "+" : "-";
            return `GMT${sign}${hrs}${mins > 0 ? `:${mins}` : ""}`;
          })()}
        </span>
      </div>
    </div>
  );
});

