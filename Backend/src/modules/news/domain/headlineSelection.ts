/**
 * Logika murni pemilihan headline untuk konteks LLM — domain logic tanpa IO.
 *
 * Di-ekstrak dari PgNewsRepository.getLatestHeadlines supaya heuristik
 * "terbaru per tag + dedup" bisa diuji unit tanpa repository/port.
 */

export interface HeadlineSource {
  url: string;
  source: string;
  title: string;
  publishedAt: Date | null;
}

export interface Headline {
  source: string;
  title: string;
}

/**
 * Gabungkan daftar artikel per-tag menjadi satu daftar headline:
 * 1. Dedup by url (artikel multi-tag muncul di beberapa grup tag).
 * 2. Sort by published_at DESC.
 * 3. Potong ke `limit` total.
 *
 * Karena input sudah "N terbaru per tag", tiap tag pasti terwakili berita
 * terbarunya — bukan satu tag yang mendominasi hasil.
 */
export function selectHeadlines(perTag: HeadlineSource[][], limit: number): Headline[] {
  const seen = new Set<string>();
  return perTag
    .flat()
    .filter((a) => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    })
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, limit)
    .map((a) => ({ source: a.source, title: a.title }));
}
