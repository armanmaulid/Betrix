import { pool } from "../db/pool.js";

export async function logTokenUsage({
  userId,
  taskType,
  modelUsed,
  inputTokens = 0,
  outputTokens = 0,
  latencyMs = null,
}) {
  const totalTokens = inputTokens + outputTokens;

  await pool.query(
    `INSERT INTO token_usage (user_id, task_type, model_used, input_tokens, output_tokens, total_tokens, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, taskType, modelUsed, inputTokens, outputTokens, totalTokens, latencyMs]
  );
}

export async function getUserUsage(userId, days = 30) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) as request_count,
       SUM(input_tokens) as total_input_tokens,
       SUM(output_tokens) as total_output_tokens,
       SUM(total_tokens) as total_tokens,
       AVG(latency_ms)::INTEGER as avg_latency_ms,
       MIN(created_at) as first_request,
       MAX(created_at) as last_request
     FROM token_usage
     WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '1 day' * $2`,
    [userId, days]
  );

  const { rows: byTaskType } = await pool.query(
    `SELECT
       task_type,
       COUNT(*) as request_count,
       SUM(total_tokens) as total_tokens
     FROM token_usage
     WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '1 day' * $2
     GROUP BY task_type
     ORDER BY total_tokens DESC`,
    [userId, days]
  );

  const { rows: dailyUsage } = await pool.query(
    `SELECT
       DATE(created_at) as date,
       COUNT(*) as request_count,
       SUM(total_tokens) as total_tokens
     FROM token_usage
     WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '1 day' * $2
     GROUP BY DATE(created_at)
     ORDER BY date DESC`,
    [userId, days]
  );

  return {
    summary: rows[0],
    byTaskType,
    dailyUsage,
  };
}

export async function getGlobalUsage(days = 30) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) as total_requests,
       COUNT(DISTINCT user_id) as active_users,
       SUM(input_tokens) as total_input_tokens,
       SUM(output_tokens) as total_output_tokens,
       SUM(total_tokens) as total_tokens,
       AVG(latency_ms)::INTEGER as avg_latency_ms,
       MIN(created_at) as first_request,
       MAX(created_at) as last_request
     FROM token_usage
     WHERE created_at >= NOW() - INTERVAL '1 day' * $1`,
    [days]
  );

  const { rows: byTaskType } = await pool.query(
    `SELECT
       task_type,
       COUNT(*) as request_count,
       SUM(total_tokens) as total_tokens,
       COUNT(DISTINCT user_id) as unique_users
     FROM token_usage
     WHERE created_at >= NOW() - INTERVAL '1 day' * $1
     GROUP BY task_type
     ORDER BY total_tokens DESC`,
    [days]
  );

  const { rows: byModel } = await pool.query(
    `SELECT
       model_used,
       COUNT(*) as request_count,
       SUM(total_tokens) as total_tokens
     FROM token_usage
     WHERE created_at >= NOW() - INTERVAL '1 day' * $1
     GROUP BY model_used
     ORDER BY total_tokens DESC`,
    [days]
  );

  const { rows: dailyTrend } = await pool.query(
    `SELECT
       DATE(created_at) as date,
       COUNT(*) as request_count,
       COUNT(DISTINCT user_id) as active_users,
       SUM(total_tokens) as total_tokens
     FROM token_usage
     WHERE created_at >= NOW() - INTERVAL '1 day' * $1
     GROUP BY DATE(created_at)
     ORDER BY date DESC`,
    [days]
  );

  const { rows: topUsers } = await pool.query(
    `SELECT
       u.id,
       u.email,
       COUNT(*) as request_count,
       SUM(t.total_tokens) as total_tokens
     FROM token_usage t
     JOIN users u ON t.user_id = u.id
     WHERE t.created_at >= NOW() - INTERVAL '1 day' * $1
     GROUP BY u.id, u.email
     ORDER BY total_tokens DESC
     LIMIT 10`,
    [days]
  );

  return {
    summary: rows[0],
    byTaskType,
    byModel,
    dailyTrend,
    topUsers,
  };
}

export async function getCurrentMonthUsage(userId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) as request_count,
       SUM(total_tokens) as total_tokens
     FROM token_usage
     WHERE user_id = $1
       AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`,
    [userId]
  );

  return rows[0];
}

export async function cleanupOldUsageRecords() {
  const { rowCount } = await pool.query(
    `DELETE FROM token_usage
     WHERE created_at < NOW() - INTERVAL '90 days'`
  );

  return rowCount;
}
