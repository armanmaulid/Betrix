import { pool } from "../db/pool.js";
import { redis } from "../db/redis.js";

export async function healthCheck(req, res) {
  const checks = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {},
  };

  try {
    const start = Date.now();
    await pool.query("SELECT 1");
    checks.services.postgres = {
      status: "up",
      responseTime: Date.now() - start,
    };
  } catch (err) {
    checks.status = "unhealthy";
    checks.services.postgres = {
      status: "down",
      error: err.message,
    };
  }

  try {
    const start = Date.now();
    await redis.ping();
    checks.services.redis = {
      status: "up",
      responseTime: Date.now() - start,
    };
  } catch (err) {
    checks.status = "unhealthy";
    checks.services.redis = {
      status: "down",
      error: err.message,
    };
  }

  const statusCode = checks.status === "healthy" ? 200 : 503;
  res.status(statusCode).json(checks);
}
