import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";

export async function logUserActivity({ userId, action, details = null, ip = null, userAgent = null }) {
  try {
    await pool.query(
      `INSERT INTO user_activity_logs (user_id, action, details, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, details ? JSON.stringify(details) : null, ip, userAgent]
    );
  } catch (err) {
    logger.error("error:", { context: "Activity", error: err.message, userId, action });
  }
}

