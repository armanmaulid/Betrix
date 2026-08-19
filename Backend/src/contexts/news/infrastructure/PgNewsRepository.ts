import { injectable } from "tsyringe";
import { pgClient } from "@data/orm/pgClient.js";
import { NewsRepository } from "@contexts/news/domain/NewsRepository.js";
import { NewsContextPort } from "@contexts/news/domain/NewsContextPort.js";
import { NewsArticle } from "@contexts/news/domain/NewsArticle.js";
import { selectHeadlines } from "@contexts/news/domain/headlineSelection.js";

interface NewsArticleRow {
  id: string;
  source: string;
  title: string;
  url: string;
  summary: string | null;
  asset_tags: string[];
  published_at: Date | null;
  created_at: Date;
}

@injectable()
export class PgNewsRepository implements NewsRepository, NewsContextPort {
  async save(article: NewsArticle): Promise<NewsArticle> {
    const { rows } = await pgClient.query(
      `INSERT INTO news_articles (id, source, title, url, summary, asset_tags, published_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (url) DO UPDATE SET
         summary = EXCLUDED.summary,
         asset_tags = EXCLUDED.asset_tags
       RETURNING *`,
      [
        article.id, article.source, article.title, article.url,
        article.summary, article.assetTags, article.publishedAt, article.createdAt
      ]
    );
    return this.mapRow(rows[0]);
  }

  async saveMany(articles: NewsArticle[]): Promise<NewsArticle[]> {
    if (articles.length === 0) return [];

    const client = await pgClient.connect();
    try {
      await client.query("BEGIN");

      const placeholders: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      for (const article of articles) {
        placeholders.push(
          `($${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++})`
        );
        params.push(
          article.id, article.source, article.title, article.url,
          article.summary, article.assetTags, article.publishedAt, article.createdAt
        );
      }

      const { rows } = await client.query(
        `INSERT INTO news_articles (id, source, title, url, summary, asset_tags, published_at, created_at)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (url) DO NOTHING
         RETURNING *`,
        params
      );

      await client.query("COMMIT");
      return rows.map(this.mapRow);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async findLatest(limit: number, offset: number = 0): Promise<NewsArticle[]> {
    const { rows } = await pgClient.query(
      `SELECT * FROM news_articles ORDER BY published_at DESC NULLS LAST LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return rows.map(this.mapRow);
  }

  async findByAssetTags(tags: string[], limit: number, offset: number = 0): Promise<NewsArticle[]> {
    if (tags.length === 0) return [];
    const { rows } = await pgClient.query(
      `SELECT * FROM news_articles WHERE asset_tags && $1 ORDER BY published_at DESC NULLS LAST LIMIT $2 OFFSET $3`,
      [tags, limit, offset]
    );
    return rows.map(this.mapRow);
  }

  async findById(id: string): Promise<NewsArticle | null> {
    const { rows } = await pgClient.query(
      `SELECT * FROM news_articles WHERE id = $1`, [id]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async cleanupOlderThan(days: number): Promise<number> {
    const { rowCount } = await pgClient.query(
      `DELETE FROM news_articles WHERE published_at < NOW() - INTERVAL '1 day' * $1`,
      [days]
    );
    return rowCount || 0;
  }

  async getLatestHeadlines(assets: string[], limit: number): Promise<Array<{ source: string; title: string }>> {
    if (assets.length === 0) return [];
    // Terbaru dari MASING-MASING tag, bukan N terbaru campur — kalau campur,
    // satu tag bisa mendominasi hasil. Heuristik merge/dedup/sort ada di
    // domain (headlineSelection) supaya testable tanpa IO.
    const perTag = await Promise.all(assets.map((tag) => this.findByAssetTags([tag], limit, 0)));
    return selectHeadlines(perTag, limit);
  }

  private mapRow(row: NewsArticleRow): NewsArticle {
    return new NewsArticle(
      row.id, row.source, row.title, row.url, row.summary,
      row.asset_tags, row.published_at, row.created_at
    );
  }
}