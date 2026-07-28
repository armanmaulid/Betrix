import { useEffect, useState } from "react";
import { fetchCandles } from "../api/marketClient";

export interface TickerSymbol {
  symbol: string; // Nama persis di MT5 Market Watch broker kamu
  label: string; // Yang ditampilkan di layar
  decimals: number; // Jumlah desimal harga (JPY pairs 3, gold 2, dst)
}

export interface TickerPrice {
  price: number;
  changePct: number;
  // Arah pergerakan dibanding harga sebelumnya di sesi ini — null di
  // load pertama (belum ada pembanding), dipakai komponen buat trigger
  // class flash-up/flash-down sesaat.
  direction: "up" | "down" | null;
  // N harga close terakhir (urut lama->baru), buat render micro-sparkline
  // di WatchlistPanel tanpa request terpisah.
  history: number[];
}


const HISTORY_LENGTH = 20;

// Kedua tempat harga live ditampilkan (TickerStrip di atas, WatchlistPanel
// di kanan) butuh data yang sama persis: "harga terakhir + %change vs candle
// M1 sebelumnya" untuk sekumpulan simbol. Logic fetch+poll-nya disatukan di
// sini supaya tidak dobel antara dua komponen.
export function useTickerPrices(symbols: TickerSymbol[]): Record<string, TickerPrice> {
  const [data, setData] = useState<Record<string, TickerPrice>>({});
  const symbolKey = symbols.map((s) => s.symbol).join(",");

  useEffect(() => {
    let cancelled = false;
    let eventSource: EventSource | null = null;
    let baseData: Record<string, { prevClose: number }> = {};
    const abortController = new AbortController();

    async function loadInitial() {
      const results = await Promise.allSettled(
        symbols.map(async ({ symbol }) => {
          // Fetch M1 for sparkline history
          const candlesM1 = await fetchCandles(symbol, "M1", HISTORY_LENGTH + 1, abortController.signal);
          if (candlesM1.length < 2) throw new Error("not enough M1 candles");
          
          // Fetch D1 to calculate daily percentage change (Industry Standard)
          const candlesD1 = await fetchCandles(symbol, "D1", 2, abortController.signal).catch(() => []);
          
          const latest = candlesM1[candlesM1.length - 1];
          const history = candlesM1.map((c) => c.close);
          
          let prevClose = candlesM1[candlesM1.length - 2].close; // Fallback
          if (candlesD1.length > 0) {
            // Gunakan harga Open hari ini (candle terakhir di D1)
            prevClose = candlesD1[candlesD1.length - 1].open;
          }
          
          const changePct = ((latest.close - prevClose) / prevClose) * 100;
          return { symbol, price: latest.close, changePct, history, prevClose };
        })
      );

      if (cancelled) return;

      setData((prevData) => {
        const next = { ...prevData };
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            const sym = symbols[i].symbol;
            baseData[sym] = { prevClose: r.value.prevClose };
            next[sym] = {
              price: r.value.price,
              changePct: r.value.changePct,
              direction: null,
              history: r.value.history,
            };
          }
        });
        return next;
      });

      // Start SSE after initial load
      if (!cancelled) {
        startStreaming();
      }
    }

    function startStreaming() {
      const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const token = localStorage.getItem("eaconsole.sessionToken") || "";
      const url = `${BACKEND_URL}/api/market/stream?symbol=${symbolKey}&token=${token}`;
      eventSource = new EventSource(url);

      eventSource.addEventListener("price_update", (e) => {
        if (cancelled) return;
        try {
          const update = JSON.parse(e.data);
          const sym = update.symbol;
          if (!sym) return;

          setData((prevData) => {
            const current = prevData[sym];
            if (!current) return prevData;

            const newPrice = update.price || update.bid;
            if (newPrice === current.price) return prevData; // No change

            const direction =
              newPrice > current.price
                ? "up"
                : newPrice < current.price
                ? "down"
                : current.direction;

            const prevClose = baseData[sym]?.prevClose || current.price;
            const changePct =
              prevClose > 0 ? ((newPrice - prevClose) / prevClose) * 100 : 0;

            const newHistory = [...current.history];
            if (newHistory.length > 0) {
              newHistory[newHistory.length - 1] = newPrice;
            }

            return {
              ...prevData,
              [sym]: {
                price: newPrice,
                changePct,
                direction,
                history: newHistory,
              },
            };
          });
        } catch (err) {
          console.error("Failed to parse SSE price update", err);
        }
      });

      eventSource.onerror = () => {
        // SSE natively reconnects, we don't need to do anything, just wait.
      };
    }

    loadInitial();

    return () => {
      cancelled = true;
      abortController.abort();
      if (eventSource) {
        eventSource.close();
      }
    };
    // symbolKey (bukan symbols) sengaja jadi dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolKey]);

  return data;
}

// Symbol default: major FX pairs, metal (gold/silver), energy, crypto.
// PENTING soal nama simbol: FX majors di bawah ini standar di hampir semua
// broker MT5, tapi symbol emas/perak/oil/crypto BERVARIASI antar broker
// (kadang ada suffix seperti .a/.m, atau nama beda sama sekali seperti
// "WTI"/"XTIUSD"/"CL" untuk oil, atau "BTCUSD.a" untuk crypto). Kalau ada
// simbol di bawah yang 404, cek nama yang benar lewat mt5-bridge:
// GET /symbols?group=*OIL* atau *BTC* dst, lalu sesuaikan di sini.
export const MARKET_SYMBOLS: TickerSymbol[] = [
  { symbol: "EURUSD", label: "EUR/USD", decimals: 5 },
  { symbol: "GBPUSD", label: "GBP/USD", decimals: 5 },
  { symbol: "USDJPY", label: "USD/JPY", decimals: 3 },
  { symbol: "USDCHF", label: "USD/CHF", decimals: 5 },
  { symbol: "USDCAD", label: "USD/CAD", decimals: 5 },
  { symbol: "AUDUSD", label: "AUD/USD", decimals: 5 },
  { symbol: "NZDUSD", label: "NZD/USD", decimals: 5 },
  { symbol: "XAUUSD", label: "GOLD", decimals: 2 },
  { symbol: "XAGUSD", label: "SILVER", decimals: 3 },
  { symbol: "XTIUSD", label: "WTI OIL", decimals: 2 },
  { symbol: "BTCUSD", label: "BTC/USD", decimals: 2 },
  { symbol: "ETHUSD", label: "ETH/USD", decimals: 2 },
];
