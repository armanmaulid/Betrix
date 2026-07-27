import { pool } from "../db/pool.js";

export async function logChat({
  userId,
  taskType,
  modelUsed,
  message,
  reply,
  latencyMs,
  usage,
}) {
  await pool.query(
    `INSERT INTO chat_logs
      (user_id, task_type, model_used, message, reply, latency_ms, input_tokens, output_tokens)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      userId || null,
      taskType,
      modelUsed,
      message,
      reply,
      latencyMs || null,
      usage?.input_tokens || null,
      usage?.output_tokens || null,
    ]
  );
}

export async function getChatHistory(userId, limit = 50) {
  const { rows } = await pool.query(
    `SELECT task_type, model_used, message, reply, latency_ms,
            input_tokens, output_tokens, created_at
     FROM chat_logs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}
