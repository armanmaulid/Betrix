/**
 * Logika murni penandaan (tagging) artikel berita — domain logic tanpa IO.
 *
 * Di-ekstrak dari `NewsService.createAndTagArticle` (Phase 8 follow-up)
 * supaya heuristik asset-tag bisa diuji unit tanpa repository/port.
 */

export interface TaggingSource {
  headline: string;
  summary: string | null;
  source: string;
}

/**
 * Tentukan asset tags untuk sebuah artikel berdasarkan kategori feed
 * dan heuristik kata kunci di judul + ringkasan.
 *
 * Urutan prioritas:
 * 1. Tag spesifik (btc/usd/eur/gbp/jpy/metal/oil) bila kata kunci cocok.
 *    Catatan: feed/sumber crypto selalu menghasilkan "btc" (branch pertama
 *    menangkap kategori & kata kunci crypto sekaligus).
 * 2. Bila tidak ada tag spesifik, fallback kategori: forex/investing → "eco",
 *    selainnya → "global". (Fallback "crypto" dihapus — tak pernah reachable.)
 */
export function tagNewsArticle(raw: TaggingSource, category: string): string[] {
  const text = `${raw.headline} ${raw.summary || ""}`.toLowerCase();
  const tags = new Set<string>();

  if (category === "crypto" || raw.source.toLowerCase().includes("crypto") || /\b(btc|bitcoin|crypto|ethereum|eth)\b/.test(text)) {
    tags.add("btc");
  }
  if (/\b(usd|dollar|fed\b|fomc|federal reserve|greenback)\b/.test(text)) {
    tags.add("usd");
  }
  if (/\b(eur|euro|ecb|eurozone)\b/.test(text)) {
    tags.add("eur");
  }
  if (/\b(gbp|pound|sterling|boe|bank of england)\b/.test(text)) {
    tags.add("gbp");
  }
  if (/\b(jpy|yen|boj|bank of japan)\b/.test(text)) {
    tags.add("jpy");
  }
  if (/\b(gold|silver|xau|xag|precious metal)\b/.test(text)) {
    tags.add("metal");
  }
  if (/\b(oil|wti|brent|crude)\b/.test(text)) {
    tags.add("oil");
  }

  if (tags.size === 0) {
    if (category === "forex" || raw.source.toLowerCase().includes("investing")) {
      tags.add("eco");
    } else {
      tags.add("global");
    }
  }

  return Array.from(tags);
}
