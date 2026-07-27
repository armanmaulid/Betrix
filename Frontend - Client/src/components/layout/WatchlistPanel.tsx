import { useEffect, useRef, useState } from "react";
import { useTickerPrices, MARKET_SYMBOLS } from "../../hooks/useTickerPrices";

// Subset dari MARKET_SYMBOLS — majors + gold/silver. Sengaja tidak semua 12
// simbol biar panel kanan nggak kepanjangan; ticker atas tetap nampilin
// semuanya termasuk oil & crypto.
const WATCHLIST_SYMBOLS = MARKET_SYMBOLS.slice(0, 9);

const FLASH_DURATION_MS = 350; // harus sama dengan durasi animasi flash-up/flash-down di index.css

// Sparkline minimalis 40x16 — tanpa axis/label, cuma bentuk garis. Dipakai
// untuk kesan "banyak data dalam sedikit ruang" khas terminal finansial.
function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) {
    return <svg width="40" height="16" className="flex-shrink-0" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 40;
      const y = 16 - ((v - min) / range) * 16;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width="40" height="16" className="flex-shrink-0">
      <polyline points={points} fill="none" stroke={up ? "var(--success)" : "var(--danger)"} strokeWidth="1" />
    </svg>
  );
}

export function WatchlistPanel() {
  const prices = useTickerPrices(WATCHLIST_SYMBOLS);
  // Simbol yang lagi flash saat ini + arahnya — dilepas otomatis setelah
  // FLASH_DURATION_MS lewat timeout per-simbol.
  const [flashing, setFlashing] = useState<Record<string, "up" | "down">>({});
  const timeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    WATCHLIST_SYMBOLS.forEach((s) => {
      const d = prices[s.symbol];
      if (!d?.direction) return;

      setFlashing((prev) => ({ ...prev, [s.symbol]: d.direction! }));
      clearTimeout(timeoutsRef.current[s.symbol]);
      timeoutsRef.current[s.symbol] = setTimeout(() => {
        setFlashing((prev) => {
          const next = { ...prev };
          delete next[s.symbol];
          return next;
        });
      }, FLASH_DURATION_MS);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices]);

  useEffect(() => {
    return () => {
      Object.values(timeoutsRef.current).forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface)] last:border-b-0">
      <div className="border-b border-l-2 border-b-[var(--border)] border-l-[var(--info)] bg-[var(--surface)] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[var(--info)]">
        Watchlist
      </div>

      <div className="grid grid-cols-[1fr_40px_auto_auto] gap-x-3 px-3 pb-1 pt-2 text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
        <span>Ticker</span>
        <span />
        <span className="text-right">Chg%</span>
        <span className="text-right">Price</span>
      </div>

      <div className="divide-y divide-[var(--border)]">
        {WATCHLIST_SYMBOLS.map((s) => {
          const d = prices[s.symbol];
          const isUp = d ? d.changePct >= 0 : true;
          const flash = flashing[s.symbol];
          return (
            <div
              key={s.symbol}
              className={
                "grid grid-cols-[1fr_40px_auto_auto] items-center gap-x-3 px-3 py-1.5 text-[11px] " +
                (flash === "up" ? "flash-up" : flash === "down" ? "flash-down" : "")
              }
            >
              <span className="truncate font-semibold text-[var(--text-primary)]">{s.label}</span>
              <Sparkline values={d?.history ?? []} up={isUp} />
              <span
                className={
                  "tabular text-right " +
                  (d ? (isUp ? "text-[var(--success)]" : "text-[var(--danger)]") : "text-[var(--text-muted)]")
                }
              >
                {d ? `${isUp ? "+" : ""}${d.changePct.toFixed(2)}%` : "—"}
              </span>
              <span className="tabular text-right text-[var(--text-primary)]">
                {d ? d.price.toFixed(s.decimals) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
