import { Router } from "express";
import { pgClient } from "@data/orm/pgClient.js";
import { redisClient } from "@data/orm/redisClient.js";

const router = Router();

router.get("/health", async (req, res) => {
  const checks = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {} as Record<string, any>,
  };

  try {
    const start = Date.now();
    await pgClient.query("SELECT 1");
    checks.services.postgres = {
      status: "up",
      responseTime: Date.now() - start,
    };
  } catch (err) {
    checks.status = "unhealthy";
    checks.services.postgres = { status: "down", error: (err as Error).message };
  }

  try {
    const start = Date.now();
    await redisClient.ping();
    checks.services.redis = {
      status: "up",
      responseTime: Date.now() - start,
    };
  } catch (err) {
    checks.status = "unhealthy";
    checks.services.redis = { status: "down", error: (err as Error).message };
  }

  res.status(checks.status === "healthy" ? 200 : 503).json(checks);
});

export default router;