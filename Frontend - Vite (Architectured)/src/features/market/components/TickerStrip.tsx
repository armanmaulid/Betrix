import React, { useEffect, useRef, useState } from "react";
import { useTickerPrices, MARKET_SYMBOLS, type TickerSymbol } from "../hooks/useTickerPrices";

const FLASH_DURATION_MS = 350; // harus sama dengan durasi animasi flash-up/flash-down di index.css

// Signature element halaman ini — ticker berjalan gaya Bloomberg Terminal.
// Teknik loop mulusnya: render simbol yang sama 2x berdampingan di dalam
// track selebar w-max, lalu animasikan translateX 0% -> -50%. Karena kedua
// separuh identik, begitu separuh pertama habis "digeser keluar", separuh
// kedua pas persis menggantikan posisi awal — dari mata pengguna keliatan
// tidak putus (infinite). Arah geser negatif (ke kiri) = konten terasa
// masuk dari kanan, keluar ke kiri, sama seperti ticker bursa sungguhan.
// Animasi didefinisikan di index.css (.animate-ticker) termasuk fallback
// prefers-reduced-motion.
export const TickerStrip = React.memo(function TickerStrip({ symbols = MARKET_SYMBOLS }: { symbols?: TickerSymbol[] }) {
  const prices = useTickerPrices(symbols);
  const [flashing, setFlashing] = useState<Record<string, "up" | "down">>({});
  const timeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const prevPricesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    symbols.forEach((s) => {
      const d = prices[s.symbol];
      if (!d) return;

      const prevPrice = prevPricesRef.current[s.symbol];
      
      // Hanya berkedip jika harganya BENAR-BENAR berubah (bukan karena render ulang dari simbol lain)
      if (prevPrice !== undefined && d.price !== prevPrice) {
        setFlashing((prev) => ({ ...prev, [s.symbol]: d.price > prevPrice ? "up" : "down" }));
        clearTimeout(timeoutsRef.current[s.symbol]);
        timeoutsRef.current[s.symbol] = setTimeout(() => {
          setFlashing((prev) => {
            const next = { ...prev };
            delete next[s.symbol];
            return next;
          });
        }, FLASH_DURATION_MS);
      }
      
      prevPricesRef.current[s.symbol] = d.price;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices]);

  useEffect(() => {
    return () => {
      Object.values(timeoutsRef.current).forEach(clearTimeout);
    };
  }, []);

  // Durasi mengikuti jumlah simbol supaya kecepatan geser PER SIMBOL tetap
  // konsisten, baik pakai 12 simbol default atau ditambah/dikurangi.
  const durationSeconds = Math.max(symbols.length * 3, 20);

  function renderItems(keyPrefix: string) {
    return symbols.map((s) => {
      const d = prices[s.symbol];
      const isUp = d ? d.changePct >= 0 : true;
      const flash = flashing[s.symbol];
      return (
        <div
          key={`${keyPrefix}-${s.symbol}`}
          className={
            "flex flex-shrink-0 items-center gap-2 whitespace-nowrap border-r border-[var(--border)] px-4 py-1 " +
            (flash === "up" ? "flash-up" : flash === "down" ? "flash-down" : "")
          }
        >
          <span className="text-[11px] font-medium text-orange-500">{s.label}</span>
          <span className="tabular text-sm font-bold text-[var(--text-primary)]">
            {d ? d.price.toFixed(s.decimals) : "—"}
          </span>
          <span
            className={
              "tabular text-[11px] " +
              (d ? (isUp ? "text-[var(--success)]" : "text-[var(--danger)]") : "text-[var(--text-muted)]")
            }
          >
            {d ? `${isUp ? "+" : ""}${d.changePct.toFixed(2)}%` : ""}
          </span>
        </div>
      );
    });
  }

  return (
    <div className="group flex overflow-hidden border-b border-[var(--border)] bg-[var(--surface)]">
      {/* Indikator LIVE ada di TopBar (sejajar jam) — sengaja tidak diulang di sini. */}
      <div
        className="flex w-max animate-ticker group-hover:[animation-play-state:paused]"
        style={{ animationDuration: `${durationSeconds}s` }}
      >
        {renderItems("a")}
        {renderItems("b")}
      </div>
    </div>
  );
});

