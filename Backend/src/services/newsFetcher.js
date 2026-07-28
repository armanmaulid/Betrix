import Parser from "rss-parser";
import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";
import { broadcastNews } from "./newsRealtimeStore.js";

const parser = new Parser({
  headers: {
    "User-Agent": "BetrixNewsBot/1.0 (+https://your-domain.example/about)",
  },
});

const FEEDS = [
  { url: "https://www.fxstreet.com/rss/news", source: "FXStreet" },
  { url: "https://www.fxstreet.com/rss/crypto", source: "FXStreet Crypto" },
  { url: "https://www.forexlive.com/feed/", source: "ForexLive" },
  { url: "https://www.investing.com/rss/news_14.rss", source: "Investing Eco" },
  { url: "https://www.investing.com/rss/news_11.rss", source: "Investing Comms" },
  { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664", source: "CNBC Finance" },
];

function tagAssets(title, summary, feedSource) {
  const text = `${title} ${summary || ""}`.toLowerCase();
  const tags = new Set();

  if (feedSource.includes("Crypto") || /\b(btc|bitcoin|crypto|ethereum|eth)\b/.test(text)) {
    tags.add("btc");
  }
  if (/\b(usd|dollar|fed\b|fomc|federal reserve|greenback)\b/.test(text)) {
    tags.add("usd");
  }
  if (/\b(gold|silver|xau|xag|precious metal)\b/.test(text)) {
    tags.add("metal");
  }
  if (/\b(oil|wti|brent|crude)\b/.test(text)) {
    tags.add("oil");
  }

  if (tags.size === 0) {
    if (feedSource.includes("Crypto")) tags.add("crypto");
    else if (feedSource.includes("Investing")) tags.add("eco");
    else tags.add("global");
  }

  return [...tags];
}

export async function fetchAndStoreNews() {
  const newArticles = [];

  for (const feed of FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);

      for (const item of parsed.items) {
        const tags = tagAssets(item.title, item.contentSnippet, feed.source);
        if (tags.length === 0) continue;

        const { rows } = await pool.query(
          `INSERT INTO news_articles (source, title, url, summary, asset_tags, published_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (url) DO NOTHING
           RETURNING id, source, title, url, summary, asset_tags, published_at`,
          [
            feed.source,
            item.title,
            item.link,
            item.contentSnippet || null,
            tags,
            item.isoDate ? new Date(item.isoDate) : new Date(),
          ]
        );

        if (rows.length > 0) newArticles.push(rows[0]);
      }
    } catch (err) {
      logger.error("[newsFetcher] gagal fetch feed", {
        feed: feed.url,
        error: err.message,
      });
    }
  }

  if (newArticles.length > 0) {
    logger.info(`[newsFetcher] ${newArticles.length} artikel baru disimpan`);

    broadcastNews(
      newArticles.map((r) => ({
        id: r.id,
        source: r.source,
        title: r.title,
        url: r.url,
        summary: r.summary,
        assetTags: r.asset_tags,
        publishedAt: r.published_at,
      }))
    );
  }

  return newArticles.length;
}

// Cleanup artikel lama biar tabel gak bengkak terus-terusan.
//
// NOTE (fix): fungsi ini sebelumnya sudah ada tapi TIDAK PERNAH dipanggil
// dari manapun (tidak ada di scheduled jobs server.js) — padahal
// fetchAndStoreNews() jalan tiap 1 menit dan terus INSERT baris baru ke
// news_articles tanpa batas. Sekarang didaftarkan di server.js sebagai
// bagian dari cleanup startup + interval 1 jam, sejajar dengan
// cleanupExpiredSessions/cleanupOldFailedAttempts/dst.
export async function cleanupOldNews(days = 30) {
  const { rowCount } = await pool.query(
    `DELETE FROM news_articles WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
    [days]
  );
  return rowCount;
}
