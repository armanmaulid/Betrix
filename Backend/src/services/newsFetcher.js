import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";
import { broadcastNews } from "./newsRealtimeStore.js";

function tagAssets(title, summary, feedSource, category) {
  const text = `${title} ${summary || ""}`.toLowerCase();
  const tags = new Set();

  if (category === 'crypto' || feedSource.toLowerCase().includes("crypto") || /\b(btc|bitcoin|crypto|ethereum|eth)\b/.test(text)) {
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
    if (category === 'crypto' || feedSource.toLowerCase().includes("crypto")) {
      tags.add("crypto");
    } else if (category === 'forex' || feedSource.toLowerCase().includes("investing")) {
      tags.add("eco");
    } else {
      tags.add("global");
    }
  }

  return [...tags];
}

export async function fetchAndStoreNews() {
  const newArticles = [];
  const categories = ['general', 'forex', 'crypto'];

  if (!process.env.FINNHUB_API_KEY) {
      logger.warn("FINNHUB_API_KEY is not set. Skipping news fetch.", { context: "NEWS" });
      return 0;
  }

  for (const category of categories) {
    try {
        const url = `https://finnhub.io/api/v1/news?category=${category}&token=${process.env.FINNHUB_API_KEY}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP Error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Ambil 20 berita terbaru per kategori yang memiliki summary
        // agar tidak terlalu membebani DB dan UI terlihat rapi
        const articlesToProcess = data
          .filter(item => item.summary && item.summary.trim() !== '')
          .slice(0, 20);

        for (const item of articlesToProcess) {
            const tags = tagAssets(item.headline, item.summary, item.source || '', category);
            
            // Finnhub menggunakan unix timestamp (detik), jadi harus dikali 1000
            const publishedAt = item.datetime ? new Date(item.datetime * 1000) : new Date();

            const { rows } = await pool.query(
              `INSERT INTO news_articles (source, title, url, summary, asset_tags, published_at)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (url) DO NOTHING
               RETURNING id, source, title, url, summary, asset_tags, published_at`,
              [
                item.source || 'Finnhub',
                item.headline,
                item.url,
                item.summary || null,
                tags,
                publishedAt,
              ]
            );

            if (rows.length > 0) newArticles.push(rows[0]);
        }
    } catch (err) {
        logger.error(`gagal fetch feed kategori ${category} dari Finnhub: ${err.message}`, { context: "NEWS" });
    }
  }

  if (newArticles.length > 0) {
    logger.info(`${newArticles.length} artikel baru disimpan dari Finnhub`, { context: "NEWS" });

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
export async function cleanupOldNews(days = 30) {
  const { rowCount } = await pool.query(
    `DELETE FROM news_articles WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
    [days]
  );
  return rowCount;
}

