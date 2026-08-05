import WebSocket from "ws";
import { logger } from "../utils/logger.js";
import { updatePrice } from "./mt5Client.js";

// Sumber harga TAMBAHAN untuk TickerBarPrice, di luar MT5. Alasannya
// bukan mau mengganti MT5 (yang sudah stabil buat trading logic/EA), tapi
// biar TickerBarPrice nggak numpang jatah symbol tracking MT5 dan bisa
// pakai data Finnhub yang sudah dibayar/disiapkan terpisah.
//
// PENTING: daftar simbol di sini SENGAJA TETAP (fixed), sama untuk semua
// user, BUKAN per-user watchlist. Alasannya:
//   1. Finnhub free tier WS dibatasi 50 simbol per koneksi - 12 simbol
//      tetap di bawah ini jauh di bawah limit itu, apapun jumlah user yang
//      login (1 orang atau 10.000 orang, tetap 1 koneksi WS ke Finnhub,
//      1x subscribe per simbol).
//   2. REST call Finnhub (60/menit) sama sekali TIDAK dipakai di sini -
//      semuanya lewat WS supaya limit itu nggak collision dgn kebutuhan
//      lain (News juga pakai FINNHUB_API_KEY yang sama, lihat
//      newsFetcher.js, tapi itu REST terjadwal per 10 detik - jauh dari
//      limit 60/menit).
//
// Semua 12 simbol TickerBarPrice sekarang dicover Finnhub, termasuk WTI
// (OANDA:WTICO_USD → XTIUSD). Prefix broker SENGAJA konsisten OANDA untuk
// semua forex/metal/oil - jangan campur prefix broker lain (FXCM, IC
// MARKETS, dst) walau simbolnya ada, karena tiap broker punya likuiditas/
// spread beda yang bikin harga antar simbol nggak apple-to-apple. MT5
// sekarang murni buat history/candle (fetchMt5History, D1Cache) + calendar
// - 0% dipakai buat live tick lagi (lihat mt5Only() di routes/market.js).
const FINNHUB_TO_INTERNAL = {
  "OANDA:EUR_USD": "EURUSD",
  "OANDA:GBP_USD": "GBPUSD",
  "OANDA:USD_JPY": "USDJPY",
  "OANDA:USD_CHF": "USDCHF",
  "OANDA:USD_CAD": "USDCAD",
  "OANDA:AUD_USD": "AUDUSD",
  "OANDA:NZD_USD": "NZDUSD",
  "OANDA:XAU_USD": "XAUUSD",
  "OANDA:XAG_USD": "XAGUSD",
  "OANDA:WTICO_USD": "XTIUSD",
  "BINANCE:BTCUSDT": "BTCUSD",
  "BINANCE:ETHUSDT": "ETHUSD",
};

// Satu sumber kebenaran tunggal: simbol mana yang live tick-nya jadi
// tanggung jawab Finnhub. routes/market.js pakai ini buat MEMASTIKAN MT5
// tidak ikut-ikutan diminta nge-track simbol yang sama (dulu ini nggak
// difilter — /stream, /candles, /ticker semua tetap manggil
// subscribeToSymbol(s) ke MT5 walau s ada di daftar Finnhub, jadi dua
// sumber jalan bersamaan buat data yang sama). Kalau nanti nambah/kurang
// simbol Finnhub, cukup ubah FINNHUB_TO_INTERNAL di atas — Set ini dan
// semua consumer-nya otomatis ikut update, nggak perlu sinkronisasi manual
// di banyak tempat.
export const FINNHUB_COVERED_SYMBOLS = new Set(Object.values(FINNHUB_TO_INTERNAL));

let wsConnection = null;

export function initializeFinnhubClient() {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    logger.warn("FINNHUB_API_KEY not set — Finnhub ticker stream dinonaktifkan.", { context: "Finnhub" });
    return;
  }

  let reconnectTimer;
  let reconnectAttempt = 0;

  function getBackoffDelay() {
    const base = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000);
    return base + Math.random() * 1000;
  }

  function connect() {
    logger.info("Connecting to Finnhub WebSocket...", { context: "Finnhub" });
    wsConnection = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);

    wsConnection.on("open", () => {
      logger.info(`Connected to Finnhub WS, subscribing ${Object.keys(FINNHUB_TO_INTERNAL).length} simbol tetap`, { context: "Finnhub" });
      reconnectAttempt = 0;
      for (const finnhubSymbol of Object.keys(FINNHUB_TO_INTERNAL)) {
        wsConnection.send(JSON.stringify({ type: "subscribe", symbol: finnhubSymbol }));
      }
    });

    wsConnection.on("message", (data) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.type !== "trade" || !Array.isArray(payload.data)) return; // abaikan "ping" dll

        for (const trade of payload.data) {
          const internalSymbol = FINNHUB_TO_INTERNAL[trade.s];
          if (!internalSymbol) continue; // simbol yang nggak kita subscribe (harusnya nggak pernah terjadi)

          // Trade Finnhub cuma kasih 1 harga eksekusi (p), bukan bid/ask
          // terpisah kayak MT5. Cukup buat TickerBarPrice (cuma butuh
          // .price), jadi bid/ask diisi sama biar bentuk objeknya tetap
          // kompatibel dengan consumer yang sudah ada.
          updatePrice(internalSymbol, {
            price: trade.p,
            bid: trade.p,
            ask: trade.p,
            timestamp: trade.t || Date.now(),
          });
        }
      } catch (e) {
        // Abaikan parse error - jangan sampai bikin proses crash gara-gara 1 pesan aneh
      }
    });

    wsConnection.on("close", () => {
      const delay = getBackoffDelay();
      reconnectAttempt++;
      logger.warn(`Finnhub WS connection lost. Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempt})...`, { context: "Finnhub" });
      wsConnection = null;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, delay);
    });

    wsConnection.on("error", (err) => {
      logger.error(`Finnhub WS Error: ${err.message}`, { context: "Finnhub" });
      if (wsConnection) wsConnection.close();
    });
  }

  connect();
}
