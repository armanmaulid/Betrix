import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin, logAdminAction } from "../middleware/adminAuth.js";
import { pool } from "../db/pool.js";
import { redis } from "../db/redis.js";
import { broadcastToUser } from "../services/sseManager.js";
import { revokeAllUserSessions } from "../services/sessionStore.js";
import { sendVerificationEmail, sendEmail, sendEmailChangeVerification, sendEmailChangeNotification } from "../services/emailService.js";
import { escapeCsvField } from "../utils/csv.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const router = Router();

function auditContext(req) {
  return {
    ip: req.normalizedIP || req.ip || null,
    userAgent: req.headers["user-agent"] ?? null,
  };
}


router.get("/me/verify-email", async (req, res) => {
  const token = String(req.query.token || "");
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  const page = (ok, title, message) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'JetBrains Mono','Courier New',monospace;background:#050505;color:#e8e8e8;display:flex;align-items:center;justify-content:center;min-height:100vh;line-height:1.6}
  .container{max-width:600px;width:100%;padding:20px}
  .card{background:#0f0f0f;border:1px solid #2a2a2a;padding:40px}
  .header{border-bottom:2px solid ${ok ? '#00ff88' : '#ff2e5f'};border-left:4px solid ${ok ? '#00ff88' : '#ff2e5f'};padding-bottom:20px;margin-bottom:32px}
  .status{color:${ok ? '#00ff88' : '#ff2e5f'};font-size:11px;letter-spacing:1px;margin-bottom:8px}
  h1{font-size:20px;font-weight:700;letter-spacing:0.5px;color:#e8e8e8}
  .icon{font-size:64px;text-align:center;margin:24px 0}
  .message{color:#e8e8e8;font-size:13px;line-height:1.7;margin-bottom:32px}
  .btn{display:inline-block;background:${ok ? '#00ff88' : '#ff7700'};color:#050505;text-decoration:none;padding:14px 40px;font-weight:700;font-size:13px;letter-spacing:1px;transition:opacity 0.1s linear}
  .btn:hover{opacity:0.9}
  .footer{margin-top:32px;padding-top:20px;border-top:1px solid #2a2a2a;color:#6b6b6b;font-size:10px}
</style></head>
<body><div class="container"><div class="card">
  <div class="header">
    <div class="status">▸ SYS.EMAIL.VERIFY</div>
    <h1>${title}</h1>
  </div>
  <div class="icon">${ok ? "✓" : "⚠"}</div>
  <div class="message">${message}</div>
  <a href="${frontendUrl}/profile" class="btn">${ok ? 'OPEN TERMINAL ▸' : 'RETRY ▸'}</a>
  <div class="footer">FA.TERMINAL.SYSTEM v2.1.0</div>
</div></div></body></html>`;

  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, new_email, expires_at, used_at
       FROM email_verifications WHERE token = $1`,
      [token]
    );
    const v = rows[0];
    if (!token || !v || v.used_at || new Date() > new Date(v.expires_at)) {
      return res.status(400).send(page(false, "TOKEN INVALID", "Verification token is invalid, expired, or already consumed. Request a new email change from terminal settings."));
    }
    if (!v.new_email) {
      return res.status(400).send(page(false, "TOKEN INVALID", "This token is not associated with an email change request."));
    }

    const { rows: u } = await pool.query("SELECT email FROM users WHERE id = $1", [v.user_id]);
    const oldEmail = u[0]?.email;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE email_verifications SET used_at = CURRENT_TIMESTAMP WHERE id = $1", [v.id]);
      await client.query(
        `UPDATE users SET email = $2, email_verified = TRUE, verified_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [v.user_id, v.new_email]
      );
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    await logAdminAction(v.user_id, "email_changed", "user", v.user_id, {
      oldEmail,
      newEmail: v.new_email,
    }, auditContext(req));

    if (oldEmail) {
      sendEmailChangeNotification(oldEmail, v.new_email)
        .catch((err) => console.error("[verify-email] notif email lama gagal:", err.message));
    }

    res.send(page(true, "EMAIL UPDATED", `Account email successfully changed to ${v.new_email}. Use this address for all future authentication.`));
  } catch (err) {
    console.error("[GET /api/admin/me/verify-email] error:", err.message);
    res.status(500).send(page(false, "SYSTEM ERROR", "Verification processing failed. Retry later or contact support."));
  }
});

router.use(requireAuth, requireAdmin);

const PROFILE_COLUMNS = "id, email, name, is_admin, status, email_verified, created_at, last_active, birthdate, address, phone, gender, bio";

router.get("/me", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${PROFILE_COLUMNS} FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "User tidak ditemukan" });
    res.json({ admin: rows[0] });
  } catch (err) {
    console.error("[GET /api/admin/me] error:", err.message);
    res.status(500).json({ error: "Gagal memuat profil" });
  }
});

router.patch("/me", async (req, res) => {
  const { name, birthdate, address, phone, gender, bio, email, currentPassword } = req.body ?? {};

  if (birthdate && !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) {
    return res.status(400).json({ error: "Format birthdate harus YYYY-MM-DD" });
  }
  if (gender && !["male", "female", "other"].includes(gender)) {
    return res.status(400).json({ error: "Gender tidak valid" });
  }
  if (phone && !/^[0-9+\-\s()]{6,20}$/.test(phone)) {
    return res.status(400).json({ error: "Format nomor HP tidak valid" });
  }

  const fields = { name, birthdate, address, phone, gender, bio };
  const sets = [];
  const params = [req.user.id];
  for (const [col, val] of Object.entries(fields)) {
    if (val === undefined) continue;
    params.push(val === "" ? null : val);
    sets.push(`${col} = $${params.length}`);
  }

  try {
    let admin;
    if (sets.length > 0) {
      const { rows } = await pool.query(
        `UPDATE users SET ${sets.join(", ")}
         WHERE id = $1
         RETURNING ${PROFILE_COLUMNS}`,
        params
      );
      admin = rows[0];
    } else {
      const { rows } = await pool.query(
        `SELECT ${PROFILE_COLUMNS} FROM users WHERE id = $1`,
        [req.user.id]
      );
      admin = rows[0];
    }

    let pendingEmail;
    if (email && email.trim().toLowerCase() !== admin.email.toLowerCase()) {
      const newEmail = email.trim().toLowerCase();

      if (!currentPassword) {
        return res.status(400).json({ error: "Password saat ini wajib diisi untuk mengganti email" });
      }
      const { rows: pwRows } = await pool.query(
        "SELECT password_hash FROM users WHERE id = $1",
        [req.user.id]
      );
      const passwordOk = await bcrypt.compare(currentPassword, pwRows[0]?.password_hash ?? "");
      if (!passwordOk) {
        return res.status(400).json({ error: "Password salah" });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        return res.status(400).json({ error: "Format email tidak valid" });
      }
      const { rows: dup } = await pool.query(
        "SELECT 1 FROM users WHERE lower(email) = lower($1)",
        [newEmail]
      );
      if (dup.length > 0) {
        return res.status(400).json({ error: "Email sudah dipakai akun lain" });
      }

      await pool.query(
        `UPDATE email_verifications SET used_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND used_at IS NULL`,
        [req.user.id]
      );
      const token = crypto.randomBytes(32).toString("hex");
      await pool.query(
        `INSERT INTO email_verifications (user_id, token, expires_at, new_email)
         VALUES ($1, $2, NOW() + INTERVAL '24 hours', $3)`,
        [req.user.id, token, newEmail]
      );
      await sendEmailChangeVerification(newEmail, token);
      await logAdminAction(req.user.id, "email_change_requested", "user", req.user.id, {
        oldEmail: admin.email,
        newEmail,
      }, auditContext(req));
      pendingEmail = newEmail;
    }

    res.json({ admin, pendingEmail });
  } catch (err) {
    console.error("[PATCH /api/admin/me] error:", err.message);
    res.status(500).json({ error: "Gagal menyimpan profil" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      status = "",
      role = "",
      verified = "",
      sortBy = "created_at",
      order = "DESC",
    } = req.query;

    const pageInt = Math.max(parseInt(page) || 1, 1);
    const limitInt = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const offset = (pageInt - 1) * limitInt;

    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (search) {
      conditions.push(`(email ILIKE $${paramCount} OR name ILIKE $${paramCount})`);
      params.push(`%${search}%`);
      paramCount++;
    }

    if (status && ["active", "banned", "suspended"].includes(status)) {
      conditions.push(`status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }

    if (role === "admin") {
      conditions.push("is_admin = TRUE");
    } else if (role === "user") {
      conditions.push("is_admin = FALSE");
    }

    if (verified === "true") {
      conditions.push("email_verified = TRUE");
    } else if (verified === "false") {
      conditions.push("email_verified = FALSE");
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const validSorts = ["created_at", "last_active", "email", "name", "status", "total_chats", "total_tokens"];
    const sortColumn = validSorts.includes(sortBy) ? sortBy : "created_at";
    const sortOrder = order.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const countQuery = `SELECT COUNT(*) FROM users ${whereClause}`;
    const { rows: countRows } = await pool.query(countQuery, params);
    const totalUsers = parseInt(countRows[0].count);

    params.push(limitInt);
    params.push(offset);

    const query = `
      SELECT
        id, email, name, is_admin, status, email_verified,
        created_at, last_active,
        (SELECT COUNT(*) FROM chat_logs WHERE user_id = users.id) as total_chats,
        (SELECT COALESCE(SUM(total_tokens), 0) FROM token_usage WHERE user_id = users.id) as total_tokens
      FROM users
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    const { rows: users } = await pool.query(query, params);

    res.json({
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        isAdmin: u.is_admin,
        status: u.status,
        emailVerified: u.email_verified,
        createdAt: u.created_at,
        lastActive: u.last_active,
        stats: {
          totalChats: parseInt(u.total_chats),
          totalTokens: parseInt(u.total_tokens),
        },
      })),
      pagination: {
        page: pageInt,
        limit: limitInt,
        total: totalUsers,
        totalPages: Math.ceil(totalUsers / limitInt),
      },
    });
  } catch (err) {
    console.error("[GET /api/admin/users] error:", err.message);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/users/export", async (req, res) => {
  try {
    const { search = "", status = "", role = "", verified = "", format = "csv" } = req.query;

    if (format !== "csv" && format !== "json") {
      return res.status(400).json({ error: "Format must be 'csv' or 'json'" });
    }

    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (search) {
      conditions.push(`(email ILIKE $${paramCount} OR name ILIKE $${paramCount})`);
      params.push(`%${search}%`);
      paramCount++;
    }

    if (status && ["active", "banned", "suspended"].includes(status)) {
      conditions.push(`status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }

    if (role === "admin") {
      conditions.push("is_admin = TRUE");
    } else if (role === "user") {
      conditions.push("is_admin = FALSE");
    }

    if (verified === "true") {
      conditions.push("email_verified = TRUE");
    } else if (verified === "false") {
      conditions.push("email_verified = FALSE");
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const query = `
      SELECT
        u.id, u.email, u.name, u.is_admin, u.status, u.email_verified,
        u.created_at, u.last_active,
        (SELECT COUNT(*) FROM chat_logs WHERE user_id = u.id) as total_chats,
        (SELECT COALESCE(SUM(total_tokens), 0) FROM token_usage WHERE user_id = u.id) as total_tokens
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT 50000
    `;

    const { rows: users } = await pool.query(query, params);

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="users-export-${new Date().toISOString().split('T')[0]}.json"`);

      return res.json({
        exportDate: new Date().toISOString(),
        totalUsers: users.length,
        filters: { search, status },
        users: users.map(u => ({
          id: u.id,
          email: u.email,
          name: u.name,
          isAdmin: u.is_admin,
          status: u.status,
          emailVerified: u.email_verified,
          createdAt: u.created_at,
          lastActive: u.last_active,
          totalChats: parseInt(u.total_chats),
          totalTokens: parseInt(u.total_tokens),
        })),
      });
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="users-export-${new Date().toISOString().split('T')[0]}.csv"`);

    const csvHeader = [
      "ID",
      "Email",
      "Name",
      "Is Admin",
      "Status",
      "Email Verified",
      "Created At",
      "Last Active",
      "Total Chats",
      "Total Tokens",
    ].join(",");

    res.write(csvHeader + "\n");

    users.forEach(u => {
      const row = [
        u.id,
        escapeCsvField(u.email),
        escapeCsvField(u.name || ""),
        u.is_admin,
        u.status,
        u.email_verified,
        u.created_at?.toISOString() || "",
        u.last_active?.toISOString() || "",
        u.total_chats,
        u.total_tokens,
      ].join(",");

      res.write(row + "\n");
    });

    res.end();

    await logAdminAction(req.user.id, "export_users", "system", null, {
      format,
      userCount: users.length,
      filters: { search, status },
    }, auditContext(req));
  } catch (err) {
    console.error("[GET /api/admin/users/export] error:", err.message);
    res.status(500).json({ error: "Failed to export users" });
  }
});

router.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT
        id, email, name, is_admin, status, email_verified,
        verified_at, created_at, last_active
      FROM users
      WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = rows[0];

    const { rows: statsRows } = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM chat_logs WHERE user_id = $1) as total_chats,
        (SELECT COALESCE(SUM(total_tokens), 0) FROM token_usage WHERE user_id = $1) as total_tokens,
        (SELECT COUNT(*) FROM token_usage WHERE user_id = $1) as total_requests
      `,
      [id]
    );

    const { rows: recentActivity } = await pool.query(
      `SELECT task_type, model_used, total_tokens, latency_ms, created_at
       FROM token_usage
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [id]
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.is_admin,
        status: user.status,
        emailVerified: user.email_verified,
        verifiedAt: user.verified_at,
        createdAt: user.created_at,
        lastActive: user.last_active,
      },
      stats: {
        totalChats: parseInt(statsRows[0].total_chats),
        totalTokens: parseInt(statsRows[0].total_tokens),
        totalRequests: parseInt(statsRows[0].total_requests),
      },
      recentActivity: recentActivity.map(a => ({
        taskType: a.task_type,
        model: a.model_used,
        tokens: parseInt(a.total_tokens),
        latency: a.latency_ms,
        timestamp: a.created_at,
      })),
    });
  } catch (err) {
    console.error("[GET /api/admin/users/:id] error:", err.message);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.get("/users/:id/chats", async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50, taskType = "" } = req.query;

    const pageInt = Math.max(parseInt(page) || 1, 1);
    const limitInt = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
    const offset = (pageInt - 1) * limitInt;

    const conditions = ["user_id = $1"];
    const params = [id];
    let paramCount = 2;

    if (taskType) {
      conditions.push(`task_type = $${paramCount}`);
      params.push(taskType);
      paramCount++;
    }

    const whereClause = conditions.join(" AND ");

    const countQuery = `SELECT COUNT(*) FROM chat_logs WHERE ${whereClause}`;
    const { rows: countRows } = await pool.query(countQuery, params);
    const totalChats = parseInt(countRows[0].count);

    params.push(limitInt);
    params.push(offset);

    const query = `
      SELECT id, task_type, message, reply, model_used, latency_ms, created_at
      FROM chat_logs
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    const { rows: chats } = await pool.query(query, params);

    const { rows: userRows } = await pool.query(
      "SELECT email, name FROM users WHERE id = $1",
      [id]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user: {
        id,
        email: userRows[0].email,
        name: userRows[0].name,
      },
      chats: chats.map(c => ({
        id: c.id,
        taskType: c.task_type,
        message: c.message,
        reply: c.reply,
        model: c.model_used,
        latency: c.latency_ms,
        timestamp: c.created_at,
      })),
      pagination: {
        page: pageInt,
        limit: limitInt,
        total: totalChats,
        totalPages: Math.ceil(totalChats / limitInt),
      },
    });
  } catch (err) {
    console.error("[GET /api/admin/users/:id/chats] error:", err.message);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
});

// POST /api/admin/users/:id/reset-password - Admin password reset
router.post("/users/:id/reset-password", async (req, res) => {
  try {
    const { id } = req.params;
    const { sendEmail: shouldSendEmail = true } = req.body;

    if (id === req.user.id) {
      return res.status(400).json({ error: "Cannot reset your own password. Use the regular password reset flow." });
    }

    const { rows: userRows } = await pool.query(
      "SELECT email, name FROM users WHERE id = $1",
      [id]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userRows[0];

    const tempPassword = crypto.randomBytes(4).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await pool.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [hashedPassword, id]
    );

    let emailSent = false;
    if (shouldSendEmail) {
      try {
        await sendEmail({
          to: user.email,
          subject: "Your Password Has Been Reset",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Password Reset</h2>
              <p>Hello ${user.name || user.email},</p>
              <p>An administrator has reset your password. Your temporary password is:</p>
              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <strong style="font-size: 18px; font-family: monospace;">${tempPassword}</strong>
              </div>
              <p><strong>Important:</strong> Please log in and change your password immediately for security.</p>
              <p>If you did not request this password reset, please contact support immediately.</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              <p style="color: #666; font-size: 12px;">This is an automated message from BETRIX.</p>
            </div>
          `,
          text: `
Password Reset

Hello ${user.name || user.email},

An administrator has reset your password. Your temporary password is:

${tempPassword}

Important: Please log in and change your password immediately for security.

If you did not request this password reset, please contact support immediately.
          `,
        });

        emailSent = true;
      } catch (emailErr) {
        console.error("[Password reset email] error:", emailErr.message);
        // Don't fail the request if email fails
      }
    }

    await logAdminAction(req.user.id, "reset_password", "user", id, {
      email: user.email,
      emailSent
    }, auditContext(req));

    res.json({
      message: "Password reset successfully",
      tempPassword: shouldSendEmail ? undefined : tempPassword,
      emailSent,
      user: {
        id,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("[POST /api/admin/users/:id/reset-password] error:", err.message);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

router.put("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, isAdmin } = req.body;

    if (status && !["active", "banned", "suspended"].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be: active, banned, or suspended" });
    }

    if (isAdmin !== undefined && typeof isAdmin !== "boolean") {
      return res.status(400).json({ error: "isAdmin must be a boolean" });
    }

    if (id === req.user.id) {
      return res.status(400).json({ error: "Cannot modify your own account" });
    }

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (status) {
      updates.push(`status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }

    if (isAdmin !== undefined) {
      updates.push(`is_admin = $${paramCount}`);
      params.push(isAdmin);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    params.push(id);

    const query = `
      UPDATE users
      SET ${updates.join(", ")}
      WHERE id = $${paramCount}
      RETURNING id, email, name, is_admin, status
    `;

    const { rows } = await pool.query(query, params);

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // FIX (security): sebelumnya cuma UPDATE kolom status di DB — session
    // yang sudah ada di Redis tidak tersentuh, jadi user yang di-ban/suspend
    // tetap bisa pakai token lama di endpoint non-admin (chat, market, dll)
    // sampai TTL 24 jam habis sendiri, karena requireAuth/validateSession
    // sebelumnya tidak pernah mengecek status akun. Sekarang begitu status
    // diubah ke banned/suspended, semua session aktif milik user itu
    // langsung dicabut.
    if (status === "banned" || status === "suspended") {
      revokeAllUserSessions(id).then(() => {
        // Tembak event logout ke SEMUA perangkat/sesi aktif user tersebut
        broadcastToUser(id, "logout", { reason: status });
      }).catch((err) =>
        console.error("[PUT /api/admin/users/:id] gagal revoke session:", err.message)
      );
    }

    await logAdminAction(req.user.id, "update_user", "user", id, { status, isAdmin }, auditContext(req));

    res.json({
      message: "User updated successfully",
      user: {
        id: rows[0].id,
        email: rows[0].email,
        name: rows[0].name,
        isAdmin: rows[0].is_admin,
        status: rows[0].status,
      },
    });
  } catch (err) {
    console.error("[PUT /api/admin/users/:id] error:", err.message);
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const { rows } = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING email",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await logAdminAction(req.user.id, "delete_user", "user", id, { email: rows[0].email }, auditContext(req));

    res.json({
      message: "User deleted successfully",
      email: rows[0].email,
    });
  } catch (err) {
    console.error("[DELETE /api/admin/users/:id] error:", err.message);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.get("/metrics", async (req, res) => {
  try {
    const { rows: metrics } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days') as new_users_7d,
        (SELECT COUNT(*) FROM users WHERE last_active >= NOW() - INTERVAL '24 hours') as active_users_24h,
        (SELECT COUNT(*) FROM users WHERE status = 'banned') as banned_users,
        (SELECT COUNT(*) FROM chat_logs) as total_chats,
        (SELECT COUNT(*) FROM chat_logs WHERE created_at >= NOW() - INTERVAL '24 hours') as chats_24h,
        (SELECT COALESCE(SUM(total_tokens), 0) FROM token_usage) as total_tokens_all_time,
        (SELECT COALESCE(SUM(total_tokens), 0) FROM token_usage WHERE created_at >= NOW() - INTERVAL '24 hours') as tokens_24h,
        (SELECT COALESCE(AVG(latency_ms), 0)::INTEGER FROM token_usage WHERE created_at >= NOW() - INTERVAL '24 hours') as avg_latency_24h
    `);

    res.json({
      users: {
        total: parseInt(metrics[0].total_users),
        newLast7Days: parseInt(metrics[0].new_users_7d),
        activeLast24h: parseInt(metrics[0].active_users_24h),
        banned: parseInt(metrics[0].banned_users),
      },
      chats: {
        total: parseInt(metrics[0].total_chats),
        last24h: parseInt(metrics[0].chats_24h),
      },
      tokens: {
        allTime: parseInt(metrics[0].total_tokens_all_time),
        last24h: parseInt(metrics[0].tokens_24h),
      },
      performance: {
        avgLatencyMs: metrics[0].avg_latency_24h,
      },
    });
  } catch (err) {
    console.error("[GET /api/admin/metrics] error:", err.message);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

router.get("/analytics", async (req, res) => {
  try {
    const { days, fromDate, toDate } = req.query;

    let dateCondition;
    let params = [];
    let paramCount = 1;

    if (fromDate && toDate) {
      const from = new Date(fromDate);
      const to = new Date(toDate);

      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
      }

      if (from > to) {
        return res.status(400).json({ error: "fromDate must be before toDate" });
      }

      dateCondition = `created_at >= $${paramCount} AND created_at < $${paramCount + 1}`;
      params.push(from.toISOString(), to.toISOString());
      paramCount += 2;
    } else {
      const daysInt = Math.min(Math.max(parseInt(days || 30), 1), 365);
      dateCondition = `created_at >= NOW() - INTERVAL '1 day' * $${paramCount}`;
      params.push(daysInt);
      paramCount++;
    }

    const { rows: userGrowth } = await pool.query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as new_users
      FROM users
      WHERE ${dateCondition.replace('created_at', 'users.created_at')}
      GROUP BY DATE(created_at)
      ORDER BY date ASC`,
      params
    );

    const { rows: tokenTrend } = await pool.query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as requests,
        SUM(total_tokens) as total_tokens,
        AVG(latency_ms)::INTEGER as avg_latency
      FROM token_usage
      WHERE ${dateCondition}
      GROUP BY DATE(created_at)
      ORDER BY date ASC`,
      params
    );

    const { rows: chatByTaskType } = await pool.query(
      `SELECT
        task_type,
        COUNT(*) as count
      FROM chat_logs
      WHERE ${dateCondition}
      GROUP BY task_type
      ORDER BY count DESC`,
      params
    );

    const { rows: modelDistribution } = await pool.query(
      `SELECT
        model_used,
        COUNT(*) as requests,
        SUM(total_tokens) as total_tokens
      FROM token_usage
      WHERE ${dateCondition}
      GROUP BY model_used
      ORDER BY total_tokens DESC`,
      params
    );

    const periodLabel = fromDate && toDate
      ? `${fromDate} to ${toDate}`
      : `Last ${params[0]} days`;

    res.json({
      period: periodLabel,
      userGrowth: userGrowth.map(row => ({
        date: row.date,
        newUsers: parseInt(row.new_users),
      })),
      tokenTrend: tokenTrend.map(row => ({
        date: row.date,
        requests: parseInt(row.requests),
        totalTokens: parseInt(row.total_tokens),
        avgLatency: row.avg_latency,
      })),
      chatByTaskType: chatByTaskType.map(row => ({
        taskType: row.task_type,
        count: parseInt(row.count),
      })),
      modelDistribution: modelDistribution.map(row => ({
        model: row.model_used,
        requests: parseInt(row.requests),
        totalTokens: parseInt(row.total_tokens),
      })),
    });
  } catch (err) {
    console.error("[GET /api/admin/analytics] error:", err.message);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

router.get("/system", async (req, res) => {
  try {
    const { rows: dbStats } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) as users_count,
        (SELECT COUNT(*) FROM chat_logs) as chats_count,
        (SELECT COUNT(*) FROM token_usage) as token_usage_count,
        (SELECT pg_size_pretty(pg_database_size(current_database()))) as db_size
    `);

    let redisInfo = { status: "unknown", keys: 0 };
    try {
      await redis.ping();
      const dbKeys = await redis.dbsize();
      redisInfo = {
        status: "connected",
        keys: dbKeys,
      };
    } catch (err) {
      redisInfo = { status: "error" };
    }

    const uptime = process.uptime();
    const uptimeHours = Math.floor(uptime / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);

    const memUsage = process.memoryUsage();

    res.json({
      server: {
        uptime: {
          seconds: Math.floor(uptime),
          formatted: `${uptimeHours}h ${uptimeMinutes}m`,
        },
        memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024) + " MB",
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + " MB",
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + " MB",
        },
        nodeVersion: process.version,
        platform: process.platform,
      },
      database: {
        status: "connected",
        size: dbStats[0].db_size,
        tables: {
          users: parseInt(dbStats[0].users_count),
          chats: parseInt(dbStats[0].chats_count),
          tokenUsage: parseInt(dbStats[0].token_usage_count),
        },
      },
      redis: redisInfo,
    });
  } catch (err) {
    console.error("[GET /api/admin/system] error:", err.message);
    res.status(500).json({ error: "Failed to fetch system info" });
  }
});

router.get("/logs", async (req, res) => {
  try {
    const { type = "error", limit = 50 } = req.query;
    const limitInt = Math.min(Math.max(parseInt(limit), 1), 500);

    const today = new Date().toISOString().split("T")[0];
    const logDir = path.join(process.cwd(), "logs");
    let logFile;

    if (type === "error") {
      logFile = path.join(logDir, `error-${today}.log`);
    } else {
      logFile = path.join(logDir, `combined-${today}.log`);
    }

    if (!fs.existsSync(logFile)) {
      return res.json({
        type,
        logs: [],
        message: "No logs found for today",
      });
    }

    const logContent = fs.readFileSync(logFile, "utf8");
    const lines = logContent.trim().split("\n").slice(-limitInt);

    const logs = lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return { message: line, timestamp: new Date().toISOString() };
        }
      })
      .reverse();

    res.json({
      type,
      count: logs.length,
      logs,
    });
  } catch (err) {
    console.error("[GET /api/admin/logs] error:", err.message);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

function buildAuditActionsWhere(query) {
  const { search = "", action = "", actor = "", actorType = "", from = "", to = "" } = query;
  const conditions = [];
  const params = [];
  let n = 1;

  if (actorType === "admin" || actorType === "user") {
    conditions.push(`actor_type = $${n}`);
    params.push(actorType);
    n++;
  }
  if (search) {
    conditions.push(`(
      action ILIKE $${n} OR actor_email ILIKE $${n} OR actor_name ILIKE $${n}
      OR COALESCE(target_email, '') ILIKE $${n} OR COALESCE(target_name, '') ILIKE $${n}
      OR COALESCE(details::text, '') ILIKE $${n}
    )`);
    params.push(`%${search}%`);
    n++;
  }
  if (action) {
    conditions.push(`action = $${n}`);
    params.push(action);
    n++;
  }
  if (actor) {
    conditions.push(`(actor_email ILIKE $${n} OR actor_name ILIKE $${n})`);
    params.push(`%${actor}%`);
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

  const where = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
  return { where, params, nextParam: n };
}

function auditUnionFrom() {
  return `
    FROM (
      SELECT
        a.id, a.action, a.target_type, a.target_id, a.details, a.created_at,
        CASE WHEN u.is_admin THEN 'admin' ELSE 'user' END AS actor_type,
        u.email AS actor_email, u.name AS actor_name,
        tu.email AS target_email, tu.name AS target_name,
        a.ip, a.user_agent
      FROM admin_actions a
      JOIN users u ON a.admin_id = u.id
      LEFT JOIN users tu ON a.target_type = 'user' AND a.target_id::uuid = tu.id

      UNION ALL

      SELECT
        l.id, l.action, NULL, NULL, l.details, l.created_at,
        CASE WHEN COALESCE(u.is_admin, false) THEN 'admin' ELSE 'user' END AS actor_type,
        u.email AS actor_email, u.name AS actor_name,
        NULL, NULL,
        l.ip, l.user_agent
      FROM user_activity_logs l
      LEFT JOIN users u ON l.user_id = u.id
    ) audit`;
}

router.get("/actions", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      order = "DESC",
    } = req.query;

    const pageInt = Math.max(parseInt(page) || 1, 1);
    const limitInt = Math.min(Math.max(parseInt(limit) || 25, 1), 100);
    const offset = (pageInt - 1) * limitInt;
    const sortOrder = String(order).toUpperCase() === "ASC" ? "ASC" : "DESC";

    const { where, params, nextParam } = buildAuditActionsWhere(req.query);
    const from = auditUnionFrom();

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) ${from}${where}`,
      params
    );
    const total = parseInt(countRows[0].count);

    params.push(limitInt, offset);
    const { rows } = await pool.query(
      `SELECT
        id, action, target_type, target_id, details, created_at,
        actor_type, actor_email, actor_name, target_email, target_name,
        ip, user_agent
      ${from}${where}
      ORDER BY created_at ${sortOrder}
      LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      params
    );

    res.json({
      actions: rows.map(row => ({
        id: row.id,
        action: row.action,
        actorType: row.actor_type,
        targetType: row.target_type,
        targetId: row.target_id,
        targetEmail: row.target_email,
        targetName: row.target_name,
        details: row.details,
        ip: row.ip,
        userAgent: row.user_agent,
        admin: {
          email: row.actor_email,
          name: row.actor_name,
        },
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
    console.error("[GET /api/admin/actions] error:", err.message);
    res.status(500).json({ error: "Failed to fetch admin actions" });
  }
});

router.get("/actions/meta", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT action FROM admin_actions
       UNION
       SELECT action FROM user_activity_logs
       ORDER BY action`
    );
    res.json({ actions: rows.map(r => r.action) });
  } catch (err) {
    console.error("[GET /api/admin/actions/meta] error:", err.message);
    res.status(500).json({ error: "Failed to fetch action metadata" });
  }
});

router.get("/actions/export", async (req, res) => {
  try {
    const { format = "csv" } = req.query;
    if (format !== "csv" && format !== "json") {
      return res.status(400).json({ error: "Format must be 'csv' or 'json'" });
    }

    const { where, params, nextParam } = buildAuditActionsWhere(req.query);
    const from = auditUnionFrom();

    params.push(10000);
    const { rows } = await pool.query(
      `SELECT
        id, action, target_type, target_id, details, created_at,
        actor_type, actor_email, actor_name, target_email, target_name
      ${from}${where}
      ORDER BY created_at DESC
      LIMIT $${nextParam}`,
      params
    );

    const actions = rows.map(row => ({
      id: row.id,
      action: row.action,
      actorType: row.actor_type,
      targetType: row.target_type,
      targetId: row.target_id,
      targetEmail: row.target_email,
      targetName: row.target_name,
      details: row.details,
      admin: { email: row.actor_email, name: row.actor_name },
      timestamp: row.created_at,
    }));

    const dateStr = new Date().toISOString().split("T")[0];
    const appliedFilters = {
      search: req.query.search || "",
      action: req.query.action || "",
      actor: req.query.actor || "",
      actorType: req.query.actorType || "",
      from: req.query.from || "",
      to: req.query.to || "",
    };

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="audit-trail-${dateStr}.json"`);
      return res.json({
        exportDate: new Date().toISOString(),
        filters: appliedFilters,
        count: actions.length,
        actions,
      });
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="audit-trail-${dateStr}.csv"`);

    res.write("Timestamp,Actor,Actor Email,Actor Type,Action,Target Type,Target,Target ID,Details\n");
    for (const a of actions) {
      const target = a.targetEmail || a.targetName || "";
      const detailStr = a.details ? JSON.stringify(a.details) : "";
      res.write([
        escapeCsvField(a.timestamp ? new Date(a.timestamp).toISOString() : ""),
        escapeCsvField(a.admin.name || ""),
        escapeCsvField(a.admin.email),
        escapeCsvField(a.actorType),
        escapeCsvField(a.action),
        escapeCsvField(a.targetType || ""),
        escapeCsvField(target),
        escapeCsvField(a.targetId || ""),
        escapeCsvField(detailStr),
      ].join(",") + "\n");
    }
    res.end();

    await logAdminAction(req.user.id, "export_audit_log", "system", null, {
      format,
      filters: appliedFilters,
      rowCount: actions.length,
    }, auditContext(req));
  } catch (err) {
    console.error("[GET /api/admin/actions/export] error:", err.message);
    res.status(500).json({ error: "Failed to export audit log" });
  }
});

router.post("/broadcast", async (req, res) => {
  try {
    const { subject, body, recipients } = req.body;

    if (!subject || !body) {
      return res.status(400).json({ error: "subject and body are required" });
    }

    if (subject.length > 200) {
      return res.status(400).json({ error: "Subject too long (max 200 chars)" });
    }

    let targetUserIds = [];

    if (recipients === "all") {
      const { rows } = await pool.query(
        `SELECT id FROM users WHERE status = 'active'`
      );
      targetUserIds = rows.map(r => r.id);
    } else if (Array.isArray(recipients) && recipients.length > 0) {
      const { rows } = await pool.query(
        `SELECT id FROM users WHERE id = ANY($1) AND status = 'active'`,
        [recipients]
      );
      targetUserIds = rows.map(r => r.id);

      if (targetUserIds.length === 0) {
        return res.status(400).json({ error: "No valid active recipients found" });
      }
    } else {
      return res.status(400).json({ error: "recipients must be 'all' or array of user IDs" });
    }

    if (targetUserIds.length === 0) {
      return res.status(400).json({ error: "No recipients found" });
    }

    const values = targetUserIds.map((userId, i) =>
      `(NULL, $${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
    ).join(", ");

    const params = [];
    targetUserIds.forEach(userId => {
      params.push(userId, subject, body);
    });

    await pool.query(
      `INSERT INTO messages (from_user_id, to_user_id, subject, body)
       VALUES ${values}`,
      params
    );

    const { rows: recipientsWithEmail } = await pool.query(
      `SELECT u.email, u.name, COALESCE(mnp.email_enabled, true) as email_enabled
       FROM users u
       LEFT JOIN message_notification_preferences mnp ON u.id = mnp.user_id
       WHERE u.id = ANY($1) AND u.status = 'active'`,
      [targetUserIds]
    );

    const emailPromises = recipientsWithEmail
      .filter(r => r.email_enabled)
      .map(r => {
        return sendEmail({
          to: r.email,
          subject: `Admin Announcement: ${subject}`,
          text: `${body}\n\nThis is an admin broadcast message.`,
          html: `<p>${body.replace(/\n/g, '<br>')}</p><p><em>This is an admin broadcast message.</em></p>`
        }).catch(err => {
          console.error(`[broadcast] email to ${r.email} failed:`, err.message);
        });
      });

    await Promise.allSettled(emailPromises);

    await logAdminAction(req.user.id, "broadcast_message", "system", null, {
      subject,
      recipientCount: targetUserIds.length,
      recipientType: recipients === "all" ? "all_users" : "selected_users",
    }, auditContext(req));

    res.json({
      message: "Broadcast sent successfully",
      recipientCount: targetUserIds.length,
      emailsSent: recipientsWithEmail.filter(r => r.email_enabled).length
    });
  } catch (err) {
    console.error("[POST /api/admin/broadcast] error:", err.message);
    res.status(500).json({ error: "Failed to send broadcast" });
  }
});

export default router;
