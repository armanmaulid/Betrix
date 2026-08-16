// Simbol MT5 (nama broker, dipakai mt5-bridge & KLineChart) BUKAN sistem
// penamaan yang sama dengan simbol TradingView (format EXCHANGE:TICKER) —
// TradingView tidak tahu apa-apa soal nama simbol broker kamu, jadi ini
// pemetaan manual. Major FX pairs relatif stabil (hampir semua provider
// besar di TradingView punya feed-nya via prefix "FX:"), tapi
// gold/silver/oil/crypto punya beberapa provider valid — di bawah ini
// pilihan yang paling umum & gratis dipakai.
//
// Kalau chart kosong / "Symbol not found" di widget: cari nama yang benar
// di https://www.tradingview.com/symbols/ lalu update mapping ini. Ini
// TIDAK ada hubungannya dengan konfigurasi mt5-bridge — dua sistem simbol
// yang sepenuhnya independen.
export const MT5_TO_TRADINGVIEW: Record<string, string> = {
  EURUSD: "FX:EURUSD",
  GBPUSD: "FX:GBPUSD",
  USDJPY: "FX:USDJPY",
  USDCHF: "FX:USDCHF",
  USDCAD: "FX:USDCAD",
  AUDUSD: "FX:AUDUSD",
  NZDUSD: "FX:NZDUSD",
  XAUUSD: "OANDA:XAUUSD",
  XAGUSD: "OANDA:XAGUSD",
  USOIL: "TVC:USOIL",
  BTCUSD: "COINBASE:BTCUSD",
  ETHUSD: "COINBASE:ETHUSD",
};

export function toTradingViewSymbol(mt5Symbol: string): string {
  // Lookup case-sensitive: normalisasi dulu supaya input lowercase (mis. "xauusd")
  // tetap ketemu mapping-nya, dan fallback tidak menghasilkan "OANDA:xauusd".
  const normalized = mt5Symbol.toUpperCase();
  return MT5_TO_TRADINGVIEW[normalized] ?? `OANDA:${normalized}`;
}
