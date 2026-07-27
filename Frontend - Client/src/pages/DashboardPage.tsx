import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LineChart } from "lucide-react";
import { TerminalShell } from "../components/layout/TerminalShell";
import { TradingViewWidget } from "../components/analysis/TradingViewWidget";
import { toTradingViewSymbol } from "../lib/tradingViewSymbols";
import { NewsFeed } from "../components/analysis/NewsFeed";
import { EconomicCalendar } from "../components/analysis/EconomicCalendar";
import { useAuth } from "../context/AuthContext";

// Simbol MT5 — ini yang jadi "sumber kebenaran" symbol di app (dipakai
// TickerStrip, WatchlistPanel, dan diteruskan ke AnalyzePage). Chart di
// halaman ini sendiri pakai TradingView, jadi symbol MT5-nya diterjemahkan
// dulu lewat toTradingViewSymbol() sebelum dikirim ke widget.

// Default dibuka di Gold — instrumen paling umum dicek trader retail EA forex.
const DEFAULT_SYMBOL = "XAUUSD";

// Landing page setelah login. Chart di sini TradingView (widget publik
// gratis, beban ditanggung infra TradingView — aman dibuka ratusan orang
// bersamaan). Data yang lebih presisi (dari broker MT5 kamu sendiri) baru
// dipakai di AnalyzePage, begitu user benar-benar minta sinyal AI — bukan
// buat semua orang yang sekadar mampir lihat chart.
export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);

  function handleSearchSymbol(rawSymbol: string) {
    setSymbol(rawSymbol);
  }

  return (
    <TerminalShell
      onSearchSymbol={handleSearchSymbol}
      rightPanel={
        <>
          <div id="panel-news">
            <NewsFeed />
          </div>
          <div id="panel-calendar">
            <EconomicCalendar />
          </div>
        </>
      }
    >
      <div id="panel-dashboard" className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <p className="text-[13px]">
          👋 Hai <span className="font-bold text-[var(--accent)]">{user?.name || user?.email}</span>, yuk cek
          pergerakan market hari ini.
        </p>
      </div>



      <div className="flex h-[600px] border-b border-[var(--border)]">
        <div className="flex w-1/3 flex-col border-r border-[var(--border)]">
          <div className="h-1/2 border-b border-[var(--border)]">
            <TradingViewWidget symbol="FRED:DGS10" interval="D" chartStyle="2" hideVolume={true} hideTopToolbar={true} />
          </div>
          <div className="h-1/2">
            <TradingViewWidget symbol="CAPITALCOM:DXY" interval="D" chartStyle="2" hideVolume={true} hideTopToolbar={true} />
          </div>
        </div>
        <div className="w-2/3">
          <TradingViewWidget 
            symbol={toTradingViewSymbol(symbol)} 
            studies={["RSI@tv-basicstudies", "BB@tv-basicstudies"]} 
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <p className="text-[12px] text-[var(--text-muted)]">Siap lihat sinyal trading berbasis AI untuk {symbol}?</p>
        <button
          onClick={() => navigate(`/analyze?symbol=${symbol}`)}
          className="flex items-center gap-1.5 bg-[var(--accent)] px-4 py-2 text-[12px] font-bold text-[var(--bg)] hover:opacity-90"
        >
          <LineChart size={14} />
          ANALISA SEKARANG
        </button>
      </div>
    </TerminalShell>
  );
}
