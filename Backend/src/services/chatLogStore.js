import { pool } from "../db/pool.js";

export async function logChat({
  userId,
  sessionId,
  taskType,
  modelUsed,
  message,
  reply,
  latencyMs,
  usage,
}) {
  await pool.query(
    `INSERT INTO chat_logs
      (user_id, session_id, task_type, model_used, message, reply, latency_ms, input_tokens, output_tokens)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      userId || null,
      sessionId || null,
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
    `SELECT COALESCE(session_id, id) as session_id,
            MIN(created_at) as session_start,
            MAX(created_at) as created_at,
            (array_agg(message ORDER BY created_at ASC))[1] as title,
            json_agg(
              json_build_object(
                'message', message,
                'reply', reply,
                'model_used', model_used,
                'latency_ms', latency_ms
              ) ORDER BY created_at ASC
            ) as turns
     FROM chat_logs
     WHERE user_id = $1
     GROUP BY COALESCE(session_id, id)
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}
