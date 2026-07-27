import { pool } from "../db/pool.js";

export async function getNews({ asset, limit = 30, offset = 0 }) {
  const params = [];
  let where = "";

  if (asset) {
    params.push(asset);
    where = `WHERE $${params.length} = ANY(asset_tags)`;
  }

  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT id, source, title, url, summary, asset_tags, published_at, created_at
     FROM news_articles
     ${where}
     ORDER BY published_at DESC NULLS LAST
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return rows;
}
