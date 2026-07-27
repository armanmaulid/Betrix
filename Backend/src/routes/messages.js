import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.get("/inbox", requireAuth, async (req, res) => {
  try {
    const { unread, search } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    let query = `
      SELECT
        m.id, m.subject, m.body, m.read_at, m.created_at, m.thread_id,
        u.id as from_user_id, u.email as from_email, u.name as from_name
      FROM messages m
      LEFT JOIN users u ON m.from_user_id = u.id
      WHERE m.to_user_id = $1 AND m.deleted_at IS NULL
    `;

    const params = [req.user.id];
    let paramIndex = 2;

    if (unread === "true") {
      query += ` AND m.read_at IS NULL`;
    }

    if (search) {
      query += ` AND (m.subject ILIKE $${paramIndex} OR m.body ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    let countQuery = `SELECT COUNT(*) as total FROM messages m`;
    if (search) {
      countQuery += ` LEFT JOIN users u ON m.from_user_id = u.id`;
    }
    countQuery += ` WHERE m.to_user_id = $1 AND m.deleted_at IS NULL`;
    const countParams = [req.user.id];
    let countParamIndex = 2;

    if (unread === "true") {
      countQuery += ` AND m.read_at IS NULL`;
    }

    if (search) {
      countQuery += ` AND (m.subject ILIKE $${countParamIndex} OR m.body ILIKE $${countParamIndex} OR u.name ILIKE $${countParamIndex} OR u.email ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
    }

    const { rows: totalRows } = await pool.query(countQuery, countParams);

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) as unread FROM messages WHERE to_user_id = $1 AND read_at IS NULL AND deleted_at IS NULL`,
      [req.user.id]
    );

    res.json({
      messages: rows.map(r => ({
        id: r.id,
        subject: r.subject,
        body: r.body,
        readAt: r.read_at,
        createdAt: r.created_at,
        threadId: r.thread_id,
        from: r.from_user_id ? {
          id: r.from_user_id,
          email: r.from_email,
          name: r.from_name
        } : {
          id: null,
          email: "system",
          name: "System Administrator"
        },
        to: {
          id: req.user.id,
          email: req.user.email,
          name: req.user.name
        }
      })),
      unreadCount: parseInt(countRows[0].unread),
      total: parseInt(totalRows[0].total)
    });
  } catch (err) {
    console.error("[messages/inbox] error:", err.message);
    res.status(500).json({ error: "Failed to fetch inbox" });
  }
});

router.get("/sent", requireAuth, async (req, res) => {
  try {
    const { search } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    let query = `
      SELECT
        m.id, m.subject, m.body, m.read_at, m.created_at, m.thread_id,
        u.id as to_user_id, u.email as to_email, u.name as to_name
      FROM messages m
      LEFT JOIN users u ON m.to_user_id = u.id
      WHERE m.from_user_id = $1 AND m.deleted_at IS NULL
    `;

    const params = [req.user.id];
    let paramIndex = 2;

    if (search) {
      query += ` AND (m.subject ILIKE $${paramIndex} OR m.body ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    let countQuery = `SELECT COUNT(*) as total FROM messages m`;
    if (search) {
      countQuery += ` LEFT JOIN users u ON m.to_user_id = u.id`;
    }
    countQuery += ` WHERE m.from_user_id = $1 AND m.deleted_at IS NULL`;
    const countParams = [req.user.id];
    let countParamIndex = 2;

    if (search) {
      countQuery += ` AND (m.subject ILIKE $${countParamIndex} OR m.body ILIKE $${countParamIndex} OR u.name ILIKE $${countParamIndex} OR u.email ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }

    const { rows: countRows } = await pool.query(countQuery, countParams);

    res.json({
      messages: rows.map(r => ({
        id: r.id,
        subject: r.subject,
        body: r.body,
        readAt: r.read_at,
        createdAt: r.created_at,
        threadId: r.thread_id,
        from: {
          id: req.user.id,
          email: req.user.email,
          name: req.user.name
        },
        to: r.to_user_id ? {
          id: r.to_user_id,
          email: r.to_email,
          name: r.to_name
        } : {
          id: null,
          email: "deleted",
          name: "Pengguna Dihapus"
        }
      })),
      total: parseInt(countRows[0].total)
    });
  } catch (err) {
    console.error("[messages/sent] error:", err.message);
    res.status(500).json({ error: "Failed to fetch sent messages" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT
        m.*,
        uf.id as from_user_id, uf.email as from_email, uf.name as from_name,
        ut.id as to_user_id, ut.email as to_email, ut.name as to_name
      FROM messages m
      LEFT JOIN users uf ON m.from_user_id = uf.id
      LEFT JOIN users ut ON m.to_user_id = ut.id
      WHERE m.id = $1 AND (m.from_user_id = $2 OR m.to_user_id = $2)`,
      [id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Message not found" });
    }

    const msg = rows[0];

    res.json({
      id: msg.id,
      subject: msg.subject,
      body: msg.body,
      readAt: msg.read_at,
      createdAt: msg.created_at,
      from: msg.from_user_id ? {
        id: msg.from_user_id,
        email: msg.from_email,
        name: msg.from_name
      } : {
        id: null,
        email: "system",
        name: "System Administrator"
      },
      to: msg.to_user_id ? {
        id: msg.to_user_id,
        email: msg.to_email,
        name: msg.to_name
      } : {
        id: null,
        email: "deleted",
        name: "Pengguna Dihapus"
      }
    });
  } catch (err) {
    console.error("[messages/:id] error:", err.message);
    res.status(500).json({ error: "Failed to fetch message" });
  }
});

router.post("/send", requireAuth, async (req, res) => {
  try {
    const { toEmail, subject, body, replyToMessageId } = req.body;

    if (!toEmail || !subject || !body) {
      return res.status(400).json({ error: "toEmail, subject, and body are required" });
    }

    if (subject.length > 200) {
      return res.status(400).json({ error: "Subject too long (max 200 chars)" });
    }

    const { rows: recipientRows } = await pool.query(
      `SELECT id, email, name, status FROM users WHERE email = $1`,
      [toEmail.toLowerCase().trim()]
    );

    if (recipientRows.length === 0) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    if (recipientRows[0].status !== "active") {
      return res.status(400).json({ error: "Cannot send message to inactive user" });
    }

    const recipient = recipientRows[0];

    if (recipient.id === req.user.id) {
      return res.status(400).json({ error: "Cannot send message to yourself" });
    }

    let threadId = null;
    let validReplyToMessageId = null;
    if (replyToMessageId) {
      const { rows: originalRows } = await pool.query(
        `SELECT thread_id FROM messages
         WHERE id = $1 AND (from_user_id = $2 OR to_user_id = $2)`,
        [replyToMessageId, req.user.id]
      );
      if (originalRows.length > 0) {
        threadId = originalRows[0].thread_id;
        validReplyToMessageId = replyToMessageId;
      } else {
        return res.status(400).json({ error: "Invalid replyToMessageId" });
      }
    }

    const client = await pool.connect();
    let message;
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO messages (from_user_id, to_user_id, subject, body, reply_to_message_id, thread_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, created_at`,
        [req.user.id, recipient.id, subject, body, validReplyToMessageId, threadId]
      );
      message = rows[0];

      if (!threadId) {
        await client.query(
          `UPDATE messages SET thread_id = id WHERE id = $1`,
          [message.id]
        );
      }
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    res.status(201).json({
      id: message.id,
      createdAt: message.created_at,
      message: "Message sent successfully"
    });
  } catch (err) {
    console.error("[messages/send] error:", err.message);
    res.status(500).json({ error: "Failed to send message" });
  }
});

router.get("/thread/:threadId", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        m.id, m.subject, m.body, m.read_at, m.created_at, m.reply_to_message_id,
        m.from_user_id, uf.email as from_email, uf.name as from_name,
        m.to_user_id, ut.email as to_email, ut.name as to_name
      FROM messages m
      LEFT JOIN users uf ON m.from_user_id = uf.id
      LEFT JOIN users ut ON m.to_user_id = ut.id
      WHERE m.thread_id = $1 AND (m.from_user_id = $2 OR m.to_user_id = $2) AND m.deleted_at IS NULL
      ORDER BY m.created_at ASC`,
      [req.params.threadId, req.user.id]
    );

    res.json({
      messages: rows.map(m => ({
        id: m.id,
        subject: m.subject,
        body: m.body,
        readAt: m.read_at,
        createdAt: m.created_at,
        replyToMessageId: m.reply_to_message_id,
        from: m.from_user_id ? {
          id: m.from_user_id,
          email: m.from_email,
          name: m.from_name
        } : null,
        to: {
          id: m.to_user_id,
          email: m.to_email,
          name: m.to_name
        }
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get thread" });
  }
});

router.post("/:id/read", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: checkRows } = await pool.query(
      `SELECT id, read_at, from_user_id, to_user_id FROM messages WHERE id = $1 AND (from_user_id = $2 OR to_user_id = $2)`,
      [id, req.user.id]
    );

    if (checkRows.length === 0) {
      return res.status(404).json({ error: "Message not found" });
    }

    const message = checkRows[0];

    if (message.to_user_id !== req.user.id) {
      return res.status(403).json({ error: "Only receiver can mark message as read" });
    }

    if (message.read_at) {
      return res.json({ message: "Message already marked as read" });
    }

    await pool.query(
      `UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );

    res.json({ message: "Message marked as read" });
  } catch (err) {
    console.error("[messages/:id/read] error:", err.message);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `UPDATE messages
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND (from_user_id = $2 OR to_user_id = $2) AND deleted_at IS NULL
       RETURNING id`,
      [id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Message not found or already deleted" });
    }

    res.json({ message: "Message deleted" });
  } catch (err) {
    console.error("[messages/:id] error:", err.message);
    res.status(500).json({ error: "Failed to delete message" });
  }
});

router.get("/preferences/notifications", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT email_enabled FROM message_notification_preferences WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({
      emailEnabled: rows.length === 0 ? true : rows[0].email_enabled
    });
  } catch (err) {
    console.error("[messages/preferences] error:", err.message);
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

router.post("/preferences/notifications", requireAuth, async (req, res) => {
  try {
    const { emailEnabled } = req.body;

    if (typeof emailEnabled !== "boolean") {
      return res.status(400).json({ error: "emailEnabled must be boolean" });
    }

    await pool.query(
      `INSERT INTO message_notification_preferences (user_id, email_enabled, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id)
       DO UPDATE SET email_enabled = $2, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, emailEnabled]
    );

    res.json({ message: "Preferences updated" });
  } catch (err) {
    console.error("[messages/preferences] error:", err.message);
    res.status(500).json({ error: "Failed to update preferences" });
  }
});

export default router;
