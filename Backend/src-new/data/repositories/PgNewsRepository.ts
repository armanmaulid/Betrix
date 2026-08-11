import { injectable } from "tsyringe";
import { pgClient } from "../orm/pgClient.js";
import { NewsRepository } from "@domain/repositories/NewsRepository.js";
import { NewsArticle } from "@domain/entities/NewsArticle.js";

@injectable()
export class PgNewsRepository implements NewsRepository {
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

  async saveMany(articles: NewsArticle[]): Promise<number> {
    if (articles.length === 0) return 0;
    
    const client = await pgClient.connect();
    try {
      await client.query("BEGIN");
      let count = 0;
      for (const article of articles) {
        const { rowCount } = await client.query(
          `INSERT INTO news_articles (id, source, title, url, summary, asset_tags, published_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (url) DO NOTHING`,
          [
            article.id, article.source, article.title, article.url,
            article.summary, article.assetTags, article.publishedAt, article.createdAt
          ]
        );
        count += rowCount || 0;
      }
      await client.query("COMMIT");
      return count;
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

  private mapRow(row: any): NewsArticle {
    return new NewsArticle(
      row.id, row.source, row.title, row.url, row.summary,
      row.asset_tags, row.published_at, row.created_at
    );
  }
}