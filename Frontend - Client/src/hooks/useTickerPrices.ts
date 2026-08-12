import { useEffect, useState } from "react";
import { fetchCandles } from "../api/marketClient";
import { onLogout } from "../lib/authEvents";

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
}

// TickerStrip butuh data yang sama persis: "harga terakhir + %change vs open
// candle D1 hari ini" untuk sekumpulan simbol. Logic fetch+stream-nya
// disatukan di sini supaya tidak dobel antar komponen yang pakai simbol
// sama secara bersamaan (lihat multiplexer di bawah).
// Global State for Market Stream Multiplexer
let globalEventSource: EventSource | null = null;
let activeSymbolRefs: Record<string, number> = {}; // { "EURUSD": 3 }
let globalBaseData: Record<string, { prevClose: number }> = {};
let currentPrices: Record<string, TickerPrice> = {};
const listeners = new Set<(data: Record<string, TickerPrice>) => void>();
let restartTimeout: ReturnType<typeof setTimeout>;

// State di atas hidup di luar siklus hidup komponen React (sengaja, biar
// koneksi stream di-share antar komponen yang sama-sama butuh ticker).
// Konsekuensinya: dia TIDAK otomatis ikut nutup saat user logout, karena
// tidak ada dependency ke sessionToken/user. Sebelumnya nutupnya numpang
// efek samping unmount (ProtectedRoute redirect ke /login) — jalan, tapi
// implisit dan rapuh kalau suatu saat ada consumer yang tidak dibungkus
// ProtectedRoute. Sekarang subscribe langsung ke event logout supaya
// eksplisit: begitu logout() dipanggil, stream langsung ditutup dan
// refcount di-reset, apapun status mount komponennya.
onLogout(() => {
  clearTimeout(restartTimeout);
  if (globalEventSource) {
    globalEventSource.close();
    globalEventSource = null;
  }
  activeSymbolRefs = {};
});

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
  const url = `${BACKEND_URL}/api/news/stream?token=${token}`;
  
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

      currentPrices = {
        ...currentPrices,
        [sym]: {
          price: newPrice,
          changePct,
          direction,
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

    // Registrasi symbol & jadwalkan koneksi stream SEGERA saat mount —
    // supaya subscribe ke MT5 bridge (lewat updateGlobalStream ->
    // /api/news/stream) mulai berjalan PARALEL dengan fetch harga awal
    // di bawah, bukan menunggunya selesai dulu. Sebelumnya urutannya
    // sekuensial (fetch dulu, baru connect stream +100ms debounce di
    // belakangnya), jadi realtime tick terasa "antre" di awal load.
    // Debounce 100ms tetap dipertahankan supaya kalau beberapa komponen
    // mount hampir bersamaan dengan simbol berbeda, stream-nya digabung
    // jadi 1 koneksi (bukan buka-tutup berkali-kali).
    let symbolsChanged = false;
    symbols.forEach(({ symbol }) => {
      if (!activeSymbolRefs[symbol]) {
        activeSymbolRefs[symbol] = 0;
        symbolsChanged = true;
      }
      activeSymbolRefs[symbol]++;
    });
    if (symbolsChanged) {
      clearTimeout(restartTimeout);
      restartTimeout = setTimeout(updateGlobalStream, 100);
    }

    async function loadInitial() {
      const results = await Promise.allSettled(
        symbols.map(async ({ symbol }) => {
          if (!currentPrices[symbol]) {
            // Cuma D1 (2 candle: kemarin + hari ini) — cukup buat harga
            // terkini (close candle hari ini) + baseline %change (open
            // candle hari ini). M1 dulu dipakai buat sparkline WatchlistPanel,
            // komponen itu sudah dihapus jadi fetch-nya ikut dibuang.
            const candlesD1 = await fetchCandles(symbol, "D1", 2, abortController.signal);
            if (candlesD1.length === 0) throw new Error("no D1 candle data");

            const today = candlesD1[candlesD1.length - 1];
            const prevClose = today.open;
            const changePct = prevClose > 0 ? ((today.close - prevClose) / prevClose) * 100 : 0;

            return { symbol, price: today.close, changePct, prevClose };
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
            }
          };
        }
      });

      setData({ ...currentPrices });
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
