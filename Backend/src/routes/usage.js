import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import { getUserUsage, getGlobalUsage, getCurrentMonthUsage } from "../services/tokenUsageStore.js";

const router = Router();

router.get("/me", requireAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    if (days < 1 || days > 365) {
      return res.status(400).json({ error: "Days must be between 1 and 365" });
    }

    const usage = await getUserUsage(req.user.id, days);

    res.json({
      period: `Last ${days} days`,
      summary: {
        requestCount: parseInt(usage.summary.request_count) || 0,
        totalInputTokens: parseInt(usage.summary.total_input_tokens) || 0,
        totalOutputTokens: parseInt(usage.summary.total_output_tokens) || 0,
        totalTokens: parseInt(usage.summary.total_tokens) || 0,
        avgLatencyMs: usage.summary.avg_latency_ms || 0,
        firstRequest: usage.summary.first_request,
        lastRequest: usage.summary.last_request,
      },
      byTaskType: usage.byTaskType.map(t => ({
        taskType: t.task_type,
        requestCount: parseInt(t.request_count),
        totalTokens: parseInt(t.total_tokens),
      })),
      dailyUsage: usage.dailyUsage.map(d => ({
        date: d.date,
        requestCount: parseInt(d.request_count),
        totalTokens: parseInt(d.total_tokens),
      })),
    });
  } catch (err) {
    console.error("[GET /api/usage/me] error:", err.message);
    res.status(500).json({ error: "Failed to fetch usage data" });
  }
});

router.get("/current-month", requireAuth, async (req, res) => {
  try {
    const usage = await getCurrentMonthUsage(req.user.id);

    res.json({
      period: "Current month",
      requestCount: parseInt(usage.request_count) || 0,
      totalTokens: parseInt(usage.total_tokens) || 0,
    });
  } catch (err) {
    console.error("[GET /api/usage/current-month] error:", err.message);
    res.status(500).json({ error: "Failed to fetch current month usage" });
  }
});

router.get("/stats", requireAuth, requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    if (days < 1 || days > 365) {
      return res.status(400).json({ error: "Days must be between 1 and 365" });
    }

    const stats = await getGlobalUsage(days);

    res.json({
      period: `Last ${days} days`,
      summary: {
        totalRequests: parseInt(stats.summary.total_requests) || 0,
        activeUsers: parseInt(stats.summary.active_users) || 0,
        totalInputTokens: parseInt(stats.summary.total_input_tokens) || 0,
        totalOutputTokens: parseInt(stats.summary.total_output_tokens) || 0,
        totalTokens: parseInt(stats.summary.total_tokens) || 0,
        avgLatencyMs: stats.summary.avg_latency_ms || 0,
        firstRequest: stats.summary.first_request,
        lastRequest: stats.summary.last_request,
      },
      byTaskType: stats.byTaskType.map(t => ({
        taskType: t.task_type,
        requestCount: parseInt(t.request_count),
        totalTokens: parseInt(t.total_tokens),
        uniqueUsers: parseInt(t.unique_users),
      })),
      byModel: stats.byModel.map(m => ({
        model: m.model_used,
        requestCount: parseInt(m.request_count),
        totalTokens: parseInt(m.total_tokens),
      })),
      dailyTrend: stats.dailyTrend.map(d => ({
        date: d.date,
        requestCount: parseInt(d.request_count),
        activeUsers: parseInt(d.active_users),
        totalTokens: parseInt(d.total_tokens),
      })),
      topUsers: stats.topUsers.map(u => ({
        userId: u.id,
        email: u.email,
        requestCount: parseInt(u.request_count),
        totalTokens: parseInt(u.total_tokens),
      })),
    });
  } catch (err) {
    console.error("[GET /api/usage/stats] error:", err.message);
    res.status(500).json({ error: "Failed to fetch global stats" });
  }
});

export default router;
