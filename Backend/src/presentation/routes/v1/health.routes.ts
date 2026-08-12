import { Router } from "express";
import { container } from "tsyringe";
import { AnalyticsRepository } from "@domain/repositories/AnalyticsRepository.js";

const router = Router();

router.get("/health", async (req, res) => {
  const analyticsRepo = container.resolve<AnalyticsRepository>("AnalyticsRepository");
  const checks = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {} as Record<string, any>,
  };

  try {
    const start = Date.now();
    await analyticsRepo.getDbStats();
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
    const redisStats = await analyticsRepo.getRedisStats();
    if (redisStats.status !== "connected") {
      throw new Error("Redis not connected");
    }
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