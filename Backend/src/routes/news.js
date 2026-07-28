import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getNews } from "../services/newsStore.js";
import { addClient, removeClient } from "../services/newsRealtimeStore.js";
import { validateSession } from "../services/sessionStore.js";

const router = Router();

const VALID_ASSETS = ["usd", "metal", "oil", "btc", "eco", "global", "crypto"];

router.get("/stream", async (req, res) => {
  const sessionToken = req.query.token;

  if (!sessionToken) {
    return res.status(401).json({ error: "Session token tidak ditemukan" });
  }

  const user = await validateSession(sessionToken);
  if (!user) {
    return res.status(401).json({ error: "Session tidak valid atau expired" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(`event: connected\ndata: {}\n\n`);

  addClient(res);

  req.on("close", () => {
    removeClient(res);
  });
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const { asset } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    if (asset && !VALID_ASSETS.includes(asset)) {
      return res.status(400).json({
        error: `asset tidak dikenal, pilih salah satu: ${VALID_ASSETS.join(", ")}`,
      });
    }

    const rows = await getNews({ asset, limit, offset });

    res.json({
      news: rows.map((r) => ({
        id: r.id,
        source: r.source,
        title: r.title,
        url: r.url,
        summary: r.summary,
        assetTags: r.asset_tags,
        publishedAt: r.published_at,
      })),
    });
  } catch (err) {
    console.error("[GET /api/news] error:", err.message);
    res.status(500).json({ error: "Gagal mengambil berita" });
  }
});

export default router;
