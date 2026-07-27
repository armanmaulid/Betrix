import { pool } from "../db/pool.js";

export async function requireAdmin(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { rows } = await pool.query(
      "SELECT is_admin, status FROM users WHERE id = $1",
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = rows[0];

    if (user.status !== "active") {
      return res.status(403).json({ error: "Account is " + user.status });
    }

    if (!user.is_admin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    next();
  } catch (err) {
    console.error("[requireAdmin] error:", err.message);
    res.status(500).json({ error: "Failed to verify admin status" });
  }
}

export async function logAdminAction(adminId, action, targetType = null, targetId = null, details = null, context = null) {
  try {
    await pool.query(
      `INSERT INTO admin_actions (admin_id, action, target_type, target_id, details, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        adminId,
        action,
        targetType,
        targetId,
        details ? JSON.stringify(details) : null,
        context?.ip ?? null,
        context?.userAgent ?? null,
      ]
    );
  } catch (err) {
    console.error("[logAdminAction] error:", err.message);
  }
}
