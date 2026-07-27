import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { perUserLimiter } from "../middleware/rateLimitPerUser.js";
import { routeAndCall, routeAndStream } from "../services/modelRouter.js";
import { logChat, getChatHistory } from "../services/chatLogStore.js";
import { logTokenUsage } from "../services/tokenUsageStore.js";
import { logMetrics, logger } from "../utils/logger.js";
import { logUserActivity } from "../services/activityLogger.js";
import { pool } from "../db/pool.js";
import { escapeCsvField } from "../utils/csv.js";
import { requireCredits } from "../middleware/credits.js";

const router = Router();

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-20) // Limit to last 20 messages
    .filter(msg => msg && typeof msg === "object" && (msg.role === "user" || msg.role === "assistant") && typeof msg.content === "string")
    .map(msg => ({
      role: msg.role,
      content: msg.content.substring(0, 4000) // Prevent huge token payloads
    }));
}

const VALID_TASK_TYPES = [
  "faq",
  "trade_reasoning",
  "risk_narrative",
  "market_insight",
  "quick_summary",
  "classify_signal",
];

const checkChatCredits = (req, res, next) => {
  const taskType = req.body.taskType || req.query.taskType;
  if (taskType === "trade_reasoning" || taskType === "market_insight") {
    return requireCredits(1, "chart_analysis")(req, res, next);
  }
  next();
};

// POST /api/chat
router.post("/chat", requireAuth, perUserLimiter, checkChatCredits, async (req, res) => {
  const { taskType, message, history = [] } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "'message' wajib diisi (string)" });
  }
  if (taskType && !VALID_TASK_TYPES.includes(taskType)) {
    return res.status(400).json({ error: `taskType tidak dikenal: ${taskType}` });
  }

  const cleanHistory = sanitizeHistory(history);
  const messages = [...cleanHistory, { role: "user", content: message.substring(0, 4000) }];

  try {
    const result = await routeAndCall({ taskType: taskType || "faq", messages });

    logMetrics({
      type: "chat_completion",
      taskType: taskType || "faq",
      modelUsed: result.modelUsed,
      latencyMs: result.latencyMs,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
      userId: req.user.id,
    });

    if (result.usage) {
      logTokenUsage({
        userId: req.user.id,
        taskType: taskType || "faq",
        modelUsed: result.modelUsed,
        inputTokens: result.usage.input_tokens || 0,
        outputTokens: result.usage.output_tokens || 0,
        latencyMs: result.latencyMs,
      }).catch((err) => console.error("Failed to log token usage:", err.message));
    }

    res.json({
      reply: result.text,
      modelUsed: result.modelUsed,
      latencyMs: result.latencyMs,
      usage: result.usage,
    });

    logChat({
      userId: req.user?.id,
      taskType: taskType || "faq",
      modelUsed: result.modelUsed,
      message,
      reply: result.text,
      latencyMs: result.latencyMs,
      usage: result.usage,
    }).catch((err) => {
      console.error("[logChat] gagal simpan histori:", err.message);
    });

    logUserActivity({
      userId: req.user?.id ?? null,
      action: "chat_message",
      details: { model: result.modelUsed, taskType: taskType || "faq" },
      ip: req.normalizedIP || req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });
  } catch (err) {
    console.error("[POST /api/chat] error:", err.message);
    res.status(502).json({ error: "Gagal memanggil model AI" });
  }
});

// POST /api/chat/stream
router.post("/chat/stream", requireAuth, perUserLimiter, checkChatCredits, async (req, res) => {
  const { taskType, message, history = [] } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "'message' wajib diisi (string)" });
  }
  if (taskType && !VALID_TASK_TYPES.includes(taskType)) {
    return res.status(400).json({ error: `taskType tidak dikenal: ${taskType}` });
  }

  const cleanHistory = sanitizeHistory(history);
  const messages = [...cleanHistory, { role: "user", content: message.substring(0, 4000) }];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  try {
    const result = await routeAndStream({
      taskType: taskType || "faq",
      messages,
      signal: controller.signal,
      onToken: (token) => {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      },
    });

    res.write(
      `event: done\ndata: ${JSON.stringify({
        modelUsed: result.modelUsed,
        latencyMs: result.latencyMs,
        usage: result.usage,
      })}\n\n`
    );
    res.end();

    logMetrics({
      type: "chat_stream",
      taskType: taskType || "faq",
      modelUsed: result.modelUsed,
      latencyMs: result.latencyMs,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
      userId: req.user.id,
    });

    if (result.usage) {
      logTokenUsage({
        userId: req.user.id,
        taskType: taskType || "faq",
        modelUsed: result.modelUsed,
        inputTokens: result.usage.input_tokens || 0,
        outputTokens: result.usage.output_tokens || 0,
        latencyMs: result.latencyMs,
      }).catch((err) => console.error("Failed to log token usage:", err.message));
    }

    logChat({
      userId: req.user?.id,
      taskType: taskType || "faq",
      modelUsed: result.modelUsed,
      message,
      reply: result.text,
      latencyMs: result.latencyMs,
      usage: result.usage,
    }).catch((err) => {
      console.error("[logChat] gagal simpan histori:", err.message);
    });

    logUserActivity({
      userId: req.user?.id ?? null,
      action: "chat_message",
      details: { model: result.modelUsed, taskType: taskType || "faq" },
      ip: req.normalizedIP || req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });
  } catch (err) {
    console.error("[POST /api/chat/stream] error:", err.message);
    res.write(`event: error\ndata: ${JSON.stringify({ error: "Gagal memanggil model AI" })}\n\n`);
    res.end();
  }
});

// GET /api/chat/history (endpoint utama — dipakai frontend)
router.get("/history", requireAuth, perUserLimiter, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    const { taskType, startDate, endDate } = req.query;

    let baseWhere = `WHERE user_id = $1`;
    const params = [req.user.id];
    let paramIndex = 2;

    if (taskType) {
      baseWhere += ` AND task_type = $${paramIndex}`;
      params.push(taskType);
      paramIndex++;
    }

    if (startDate) {
      baseWhere += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      baseWhere += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    const countQuery = `SELECT COUNT(*) as total FROM chat_logs ${baseWhere}`;
    const { rows: countRows } = await pool.query(countQuery, params);
    const total = parseInt(countRows[0].total);

    const query = `
      SELECT id, task_type, message, reply, model_used, latency_ms,
             input_tokens, output_tokens, created_at
      FROM chat_logs
      ${baseWhere}
      ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    const data = rows.map((row) => {
      const { input_tokens, output_tokens, ...rest } = row;
      return {
        ...rest,
        usage: {
          input_tokens: input_tokens || 0,
          output_tokens: output_tokens || 0,
        },
      };
    });

    res.json({
      data,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (err) {
    logger.error("[GET /api/chat/history] error", { error: err.message });
    res.status(500).json({ error: "Gagal mengambil chat history" });
  }
});

// GET /api/chat/export
router.get("/export", requireAuth, async (req, res) => {
  try {
    const { format = "json", taskType, startDate, endDate } = req.query;

    let query = `
      SELECT task_type, message, reply, model_used, latency_ms,
             input_tokens, output_tokens, created_at
      FROM chat_logs
      WHERE user_id = $1
    `;
    const params = [req.user.id];
    let paramIndex = 2;

    if (taskType) {
      query += ` AND task_type = $${paramIndex}`;
      params.push(taskType);
      paramIndex++;
    }
    if (startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;
    const { rows } = await pool.query(query, params);

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="chat-history-${Date.now()}.json"`);

      const conversations = rows.map((row) => {
        const { input_tokens, output_tokens, ...rest } = row;
        return {
          ...rest,
          usage: {
            input_tokens: input_tokens || 0,
            output_tokens: output_tokens || 0,
          },
        };
      });

      res.json({
        exported_at: new Date().toISOString(),
        user_id: req.user.id,
        total: rows.length,
        conversations,
      });
    } else if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="chat-history-${Date.now()}.csv"`);

      // FIX (bug keamanan/inkonsistensi): sebelumnya baris CSV di sini cuma
      // escape quote manual (`"${row.message.replace(/"/g,'""')}"`) tanpa
      // proteksi formula-injection, padahal routes/admin.js sudah punya
      // escapeCsvField() yang menangani itu (value diawali =, +, -, @ bisa
      // dieksekusi sebagai formula kalau file dibuka di Excel/Sheets).
      // message/reply chat berasal dari input user & jawaban AI — sama-sama
      // bisa mengandung karakter itu. Sekarang pakai helper yang sama
      // (utils/csv.js) di kedua tempat.
      res.write("timestamp,task_type,message,reply,model_used,latency_ms,input_tokens,output_tokens\n");

      for (const row of rows) {
        const csvRow = [
          escapeCsvField(row.created_at.toISOString()),
          escapeCsvField(row.task_type),
          escapeCsvField(row.message),
          escapeCsvField(row.reply),
          escapeCsvField(row.model_used),
          row.latency_ms ?? "",
          row.input_tokens || 0,
          row.output_tokens || 0,
        ].join(",");
        res.write(csvRow + "\n");
      }
      res.end();
    } else {
      res.status(400).json({ error: "Format harus json atau csv" });
    }
  } catch (err) {
    logger.error("[GET /api/chat/export] error", { error: err.message });
    res.status(500).json({ error: "Gagal export chat history" });
  }
});

export default router;
