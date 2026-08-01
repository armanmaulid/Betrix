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
  // tanpa request terpisah.
  history: number[];
}


const HISTORY_LENGTH = 20;

// TickerStrip butuh data yang sama persis: "harga terakhir + %change vs candle
// M1 sebelumnya" untuk sekumpulan simbol. Logic fetch+poll-nya disatukan di
// sini supaya tidak dobel antara dua komponen.
// Global State for Market Stream Multiplexer
let globalEventSource: EventSource | null = null;
let activeSymbolRefs: Record<string, number> = {}; // { "EURUSD": 3 }
let globalBaseData: Record<string, { prevClose: number }> = {};
let currentPrices: Record<string, TickerPrice> = {};
const listeners = new Set<(data: Record<string, TickerPrice>) => void>();
let restartTimeout: ReturnType<typeof setTimeout>;

function getActiveSymbolKey() {
  return Object.keys(activeSymbolRefs).sort().join(",");
}

function updateGlobalStream() {
  if (globalEventSource) {
    globalEventSource.close();
    globalEventSource = null;
  }
  
  const symbolKey = getActiveSymbolKey();
  if (!symbolKey) return; // Nobody is listening

  const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
  const token = localStorage.getItem("eaconsole.sessionToken") || "";
  const url = `${BACKEND_URL}/api/market/stream?symbol=${symbolKey}&token=${token}`;
  
  globalEventSource = new EventSource(url);
  globalEventSource.addEventListener("price_update", (e) => {
    try {
      const update = JSON.parse(e.data);
      const sym = update.symbol;
      if (!sym) return;

      const current = currentPrices[sym];
      if (!current) return;

      const newPrice = update.price || update.bid;
      if (newPrice === current.price) return;

      const direction = newPrice > current.price ? "up" : newPrice < current.price ? "down" : current.direction;
      const prevClose = globalBaseData[sym]?.prevClose || current.price;
      const changePct = prevClose > 0 ? ((newPrice - prevClose) / prevClose) * 100 : 0;

      const newHistory = [...current.history];
      if (newHistory.length > 0) {
        newHistory[newHistory.length - 1] = newPrice;
      }

      currentPrices = {
        ...currentPrices,
        [sym]: {
          price: newPrice,
          changePct,
          direction,
          history: newHistory,
        },
      };
      
      // Notify all hooks
      listeners.forEach((listener) => listener(currentPrices));
    } catch (err) {
      console.error("Failed to parse SSE price update", err);
    }
  });

  globalEventSource.onerror = () => {
    // Basic fallback: if error, wait and try to reconnect (EventSource handles native reconnect, 
    // but if it's 401 it might close completely, we can rely on standard fetch 401 handling)
  };
}

export function useTickerPrices(symbols: TickerSymbol[]): Record<string, TickerPrice> {
  const [data, setData] = useState<Record<string, TickerPrice>>({});

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    async function loadInitial() {
      const results = await Promise.allSettled(
        symbols.map(async ({ symbol }) => {
          if (!currentPrices[symbol]) {
            const candlesM1 = await fetchCandles(symbol, "M1", HISTORY_LENGTH + 1, abortController.signal);
            if (candlesM1.length < 2) throw new Error("not enough M1 candles");
            
            const candlesD1 = await fetchCandles(symbol, "D1", 2, abortController.signal).catch(() => []);
            const latest = candlesM1[candlesM1.length - 1];
            const history = candlesM1.map((c) => c.close);
            
            let prevClose = candlesM1[candlesM1.length - 2].close;
            if (candlesD1.length > 0) {
              prevClose = candlesD1[candlesD1.length - 1].open;
            }
            
            const changePct = ((latest.close - prevClose) / prevClose) * 100;
            return { symbol, price: latest.close, changePct, history, prevClose };
          }
          return { symbol, cached: true };
        })
      );

      if (cancelled) return;

      results.forEach((r, i) => {
        if (r.status === "fulfilled" && !r.value.cached) {
          const sym = symbols[i].symbol;
          globalBaseData[sym] = { prevClose: r.value.prevClose! };
          currentPrices = {
            ...currentPrices,
            [sym]: {
              price: r.value.price!,
              changePct: r.value.changePct!,
              direction: null,
              history: r.value.history!,
            }
          };
        }
      });
      
      setData({ ...currentPrices });

      if (!cancelled) {
        let changed = false;
        symbols.forEach(({ symbol }) => {
          if (!activeSymbolRefs[symbol]) {
            activeSymbolRefs[symbol] = 0;
            changed = true;
          }
          activeSymbolRefs[symbol]++;
        });
        
        if (changed) {
          clearTimeout(restartTimeout);
          restartTimeout = setTimeout(updateGlobalStream, 100); // debounce stream restarts
        }
      }
    }

    loadInitial();

    const listener = (newPrices: Record<string, TickerPrice>) => {
      setData((prev) => {
        let hasUpdates = false;
        for (const s of symbols) {
          if (prev[s.symbol] !== newPrices[s.symbol]) hasUpdates = true;
        }
        return hasUpdates ? { ...newPrices } : prev;
      });
    };
    
    listeners.add(listener);

    return () => {
      cancelled = true;
      abortController.abort();
      listeners.delete(listener);
      
      let changed = false;
      symbols.forEach(({ symbol }) => {
        if (activeSymbolRefs[symbol]) {
          activeSymbolRefs[symbol]--;
          if (activeSymbolRefs[symbol] === 0) {
            delete activeSymbolRefs[symbol];
            changed = true;
          }
        }
      });

      if (changed) {
        clearTimeout(restartTimeout);
        restartTimeout = setTimeout(updateGlobalStream, 100);
      }
    };
  }, [symbols.map(s => s.symbol).join(",")]);

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
