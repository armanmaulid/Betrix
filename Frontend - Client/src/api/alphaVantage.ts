const BASE_URL = "https://www.alphavantage.co/query";
const API_KEY = import.meta.env.VITE_ALPHA_VANTAGE_API_KEY;

if (!API_KEY) {
  // Fails loudly in the console at import time instead of silently
  // returning empty data — a missing key is easy to miss otherwise,
  // since Alpha Vantage responds HTTP 200 even when the key is bad.
  console.warn(
    "VITE_ALPHA_VANTAGE_API_KEY belum di-set. Tambahkan ke .env.local — lihat .env.example."
  );
}

// Alpha Vantage returns errors *inside* a 200 JSON body (`Information`,
// `Note`, or `Error Message` keys) rather than an HTTP error status.
// Centralized here so both fetchers below check it the same way.
function throwIfAlphaVantageError(data: any, context: string): void {
  const message = data?.Information || data?.Note || data?.["Error Message"];
  if (message) {
    throw new Error(`${context}: ${message}`);
  }
}

export interface AlphaVantageNewsItem {
  title: string;
  url: string;
  source: string;
  timePublished: string; // ISO 8601, parsed from AV's "YYYYMMDDTHHMMSS"
  summary: string;
  sentimentLabel: string; // "Bullish" | "Somewhat-Bullish" | "Neutral" | "Somewhat-Bearish" | "Bearish"
  sentimentScore: number;
}

// AV timestamps look like "20260718T093000" — convert to real ISO so
// `new Date(...)` in the UI works without a manual parser there too.
function parseAvTimestamp(raw: string): string {
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!match) return raw;
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

// NEWS_SENTIMENT covers forex + macro news in a single call — 1 request
// against the daily quota, regardless of how many articles come back.
export async function fetchForexNews(limit = 10): Promise<AlphaVantageNewsItem[]> {
  const url = `${BASE_URL}?function=NEWS_SENTIMENT&topics=forex,economy_macro&limit=${limit}&apikey=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  throwIfAlphaVantageError(data, "Gagal memuat berita");

  const feed = (data.feed || []) as any[];
  return feed.map((item) => ({
    title: item.title,
    url: item.url,
    source: item.source,
    timePublished: parseAvTimestamp(item.time_published),
    summary: item.summary,
    sentimentLabel: item.overall_sentiment_label,
    sentimentScore: item.overall_sentiment_score,
  }));
}

// NOTE: an earlier version of this file also had fetchEconomicIndicators()
// for the Economic Calendar panel. Removed — Alpha Vantage's indicator
// endpoints turned out to be latest-published-value snapshots, not a real
// forward-looking calendar, so EconomicCalendar.tsx reverted to the
// TradingView widget instead. See that file's comments for the full story.
