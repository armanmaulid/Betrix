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
import { refundCredits } from "../services/creditStore.js";
import { TASK_TIER_MAP } from "../config/models.js";

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

// FIX (business logic): dipanggil dari catch block /chat dan /chat/stream —
// kalau checkChatCredits() sudah sempat memotong kredit (req.creditsDeducted
// ke-set) tapi panggilan AI-nya gagal, kredit itu dikembalikan supaya user
// tidak dibebankan untuk layanan yang gagal diberikan.
async function refundIfCharged(req, reason) {
  if (!req.creditsDeducted) return;
  try {
    await refundCredits(req.user.id, req.creditsDeducted.amount, `refund_${req.creditsDeducted.action}`);
  } catch (refundErr) {
    console.error(`[refundIfCharged] gagal refund kredit (${reason}):`, refundErr.message);
  }
}

const VALID_TASK_TYPES = [
  "general",
  "trade_reasoning",
  "risk_narrative",
  "market_insight",
  "quick_summary",
  "classify_signal",
];

// Biaya kredit per tier model (bukan lagi flat 1 kredit utk sebagian taskType saja).
const TIER_CREDIT_COST = { cheap: 1, balanced: 3, deep: 5 };
const VALID_TIERS = ["cheap", "balanced", "deep"];

// FEATURE: tier bisa di-override manual dari dropdown Agent (Lite/Balanced/Deep)
// di command box kalau toggle "Optimize" user matikan (frontend baru kirim
// req.body.tier kalau override aktif). Kalau tidak ada override, fallback ke
// pemetaan otomatis per taskType seperti sebelumnya. Tier yang dihitung di sini
// disimpan di req.resolvedTier supaya handler /chat dan /chat/stream memakai
// tier yang PERSIS SAMA buat panggil model -- jangan sampai user di-charge
// utk tier "deep" tapi yang benar2 jalan malah "balanced".
const checkChatCredits = (req, res, next) => {
  const taskType = req.body.taskType || req.query.taskType || "general";
  const requestedTier = req.body.tier;
  const tier = requestedTier && VALID_TIERS.includes(requestedTier)
    ? requestedTier
    : (TASK_TIER_MAP[taskType] || "balanced");
  req.resolvedTier = tier;
  return requireCredits(TIER_CREDIT_COST[tier], `chat_${tier}`)(req, res, next);
};

// FIX (image upload): field `image` sebelumnya diteruskan mentah-mentah ke
// modelRouter -> AI gateway tanpa validasi format/ukuran sama sekali di
// server (cuma dicek 1MB di frontend, yang gampang di-bypass dengan curl
// langsung). Selain buang kredit untuk payload yang bukan gambar valid,
// ini juga celah abuse: field ini diteruskan sebagai `image_url.url` ke
// gateway, jadi kalau bukan data: URI, gateway bisa dipancing fetch URL
// sembarang atas nama API key kita.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB (ukuran file asli, sebelum base64)
const IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i;

function validateImageField(image) {
  if (image === undefined || image === null || image === "") {
    return { ok: true };
  }
  if (typeof image !== "string") {
    return { ok: false, error: "Format gambar tidak valid" };
  }
  const match = image.match(IMAGE_DATA_URL_RE);
  if (!match) {
    return { ok: false, error: "Gambar harus berupa data URL base64 (image/png, jpeg, webp, atau gif)" };
  }
  const approxBytes = Math.floor((match[2].length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Ukuran gambar melebihi batas maksimal ${MAX_IMAGE_BYTES / 1024 / 1024}MB`,
    };
  }
  return { ok: true };
}

// FIX (business logic): validasi body sekarang jalan SEBELUM checkChatCredits
// (bukan di dalam handler setelahnya) supaya request yang tidak valid gagal
// duluan tanpa sempat motong kredit user. Sebelumnya urutannya kebalik --
// checkChatCredits jalan duluan sebagai middleware, baru handler validasi
// message/taskType, jadi request cacat tetap dikenakan biaya tanpa refund.
function validateChatBody(req, res, next) {
  const { message, taskType, image } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "'message' wajib diisi (string)" });
  }
  if (taskType && !VALID_TASK_TYPES.includes(taskType)) {
    return res.status(400).json({ error: `taskType tidak dikenal: ${taskType}` });
  }

  const imageCheck = validateImageField(image);
  if (!imageCheck.ok) {
    return res.status(400).json({ error: imageCheck.error });
  }

  next();
}

// POST /api/chat
router.post("/chat", requireAuth, perUserLimiter, validateChatBody, checkChatCredits, async (req, res) => {
  const { taskType, message, displayMessage, history = [], sessionId } = req.body;

  const cleanHistory = sanitizeHistory(history);
  const messages = [...cleanHistory, { role: "user", content: message.substring(0, 4000) }];

  try {
    const result = await routeAndCall({ taskType: taskType || "general", messages, tier: req.resolvedTier });

    logMetrics({
      type: "chat_completion",
      taskType: taskType || "general",
      modelUsed: result.modelUsed,
      latencyMs: result.latencyMs,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
      userId: req.user.id,
    });

    if (result.usage) {
      logTokenUsage({
        userId: req.user.id,
        taskType: taskType || "general",
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
      sessionId: sessionId || null,
      taskType: taskType || "general",
      modelUsed: result.modelUsed,
      message: displayMessage || message,
      reply: result.text,
      latencyMs: result.latencyMs,
      usage: result.usage,
    }).catch((err) => {
      console.error("[logChat] gagal simpan histori:", err.message);
    });

    logUserActivity({
      userId: req.user?.id ?? null,
      action: "chat_message",
      details: { model: result.modelUsed, taskType: taskType || "general" },
      ip: req.normalizedIP || req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });
  } catch (err) {
    console.error("[POST /api/chat] error:", err.message);
    await refundIfCharged(req, "POST /api/chat");
    res.status(502).json({ error: "Gagal memanggil model AI" });
  }
});

// POST /api/chat/stream
router.post("/chat/stream", requireAuth, perUserLimiter, validateChatBody, checkChatCredits, async (req, res) => {
  const { taskType, message, displayMessage, history = [], sessionId, image } = req.body;

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
      taskType: taskType || "general",
      messages,
      tier: req.resolvedTier,
      image,
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
      taskType: taskType || "general",
      modelUsed: result.modelUsed,
      latencyMs: result.latencyMs,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
      userId: req.user.id,
    });

    if (result.usage) {
      logTokenUsage({
        userId: req.user.id,
        taskType: taskType || "general",
        modelUsed: result.modelUsed,
        inputTokens: result.usage.input_tokens || 0,
        outputTokens: result.usage.output_tokens || 0,
        latencyMs: result.latencyMs,
      }).catch((err) => console.error("Failed to log token usage:", err.message));
    }

    logChat({
      userId: req.user?.id,
      sessionId: sessionId || null,
      taskType: taskType || "general",
      modelUsed: result.modelUsed,
      message: displayMessage || message,
      reply: result.text,
      latencyMs: result.latencyMs,
      usage: result.usage,
    }).catch((err) => {
      console.error("[logChat] gagal simpan histori:", err.message);
    });

    logUserActivity({
      userId: req.user?.id ?? null,
      action: "chat_message",
      details: { model: result.modelUsed, taskType: taskType || "general" },
      ip: req.normalizedIP || req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    });
  } catch (err) {
    console.error("[POST /api/chat/stream] error:", err.message);
    await refundIfCharged(req, "POST /api/chat/stream");
    res.write(`event: error\ndata: ${JSON.stringify({ error: "Gagal memanggil model AI" })}\n\n`);
    res.end();
  }
});

// GET /api/chat/history (endpoint utama — dipakai frontend)
router.get("/chat/history", requireAuth, perUserLimiter, async (req, res) => {
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

    const countQuery = `SELECT COUNT(DISTINCT COALESCE(session_id, id)) as total FROM chat_logs ${baseWhere}`;
    const { rows: countRows } = await pool.query(countQuery, params);
    const total = parseInt(countRows[0].total);

    const query = `
      SELECT COALESCE(session_id, id) as session_id,
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
      ${baseWhere}
      GROUP BY COALESCE(session_id, id)
      ORDER BY MAX(created_at) DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    const data = rows;

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

// DELETE /api/chat/session/:sessionId
router.delete("/chat/session/:sessionId", requireAuth, perUserLimiter, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // session_id dipakai untuk chat baru; fallback ke id untuk baris lama
    // yang belum punya session_id (lihat COALESCE(session_id, id) di /chat/history).
    // Cast eksplisit ::uuid supaya tidak bergantung ke type-inference Postgres.
    const { rowCount } = await pool.query(
      `DELETE FROM chat_logs WHERE user_id = $1 AND (session_id = $2::uuid OR id = $2::uuid)`,
      [req.user.id, sessionId]
    );

    logger.info("[DELETE /api/chat/session] hasil hapus", {
      userId: req.user.id,
      sessionId,
      rowsDeleted: rowCount,
    });

    if (rowCount === 0) {
      return res.status(404).json({ error: "Sesi chat tidak ditemukan" });
    }

    res.json({ message: "Sesi chat berhasil dihapus", deleted: rowCount });
  } catch (err) {
    logger.error("[DELETE /api/chat/session] error", { error: err.message, sessionId: req.params.sessionId });
    res.status(500).json({ error: "Gagal menghapus sesi chat" });
  }
});

// GET /api/chat/export
router.get("/chat/export", requireAuth, async (req, res) => {
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
