import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { pool } from "../db/pool.js";

const router = Router();

router.get("/activity", requireAuth, async (req, res) => {
  try {
    const { page = 1, limit = 25, action = "", from = "", to = "" } = req.query;
    const pageInt = Math.max(parseInt(page) || 1, 1);
    const limitInt = Math.min(Math.max(parseInt(limit) || 25, 1), 100);
    const offset = (pageInt - 1) * limitInt;

    const conditions = ["user_id = $1"];
    const params = [req.user.id];
    let n = 2;

    if (action) {
      conditions.push(`action = $${n}`);
      params.push(action);
      n++;
    }
    if (from) {
      conditions.push(`created_at >= $${n}::date`);
      params.push(from);
      n++;
    }
    if (to) {
      conditions.push(`created_at < ($${n}::date + interval '1 day')`);
      params.push(to);
      n++;
    }

    const where = " WHERE " + conditions.join(" AND ");

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM user_activity_logs${where}`,
      params
    );
    const total = parseInt(countRows[0].count);

    params.push(limitInt, offset);
    const { rows } = await pool.query(
      `SELECT id, action, details, ip, created_at
       FROM user_activity_logs${where}
       ORDER BY created_at DESC
       LIMIT $${n} OFFSET $${n + 1}`,
      params
    );

    res.json({
      activities: rows.map(row => ({
        id: row.id,
        action: row.action,
        details: row.details,
        ip: row.ip,
        timestamp: row.created_at,
      })),
      pagination: {
        page: pageInt,
        limit: limitInt,
        total,
        totalPages: Math.ceil(total / limitInt),
      },
    });
  } catch (err) {
    console.error("[GET /api/me/activity] error:", err.message);
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

export default router;
