import "reflect-metadata";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import passport from "passport";
import { registerDependencies } from "./container.js";
import { registerEventHandlers } from "./events.js";
import { registerRoutes } from "./registerRoutes.js";
import { registerMiddleware } from "./registerMiddleware.js";
import { errorHandler } from "@core/middleware/errorHandler.js";
import { requestLogger } from "@core/logging/requestLogger.js";
import { requestId } from "@core/middleware/requestId.js";
import { sanitizeInput } from "@core/middleware/sanitize.js";
import { env } from "@config/env";
import { logger } from "@core/logging/logger.js";
import { closePgClient } from "@data/orm/pgClient.js";
import { closeRedisClient } from "@data/orm/redisClient.js";
import { runStartupJobs, startBackgroundJobs } from "@background/jobs/index.js";
import "../config/passport.js";

export async function createApp() {
  registerDependencies();
  registerEventHandlers();
  
  const app = express();
  
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
  
  // Core middleware
  app.use(requestId);
  app.use(requestLogger);
  app.use(express.json({ limit: "15mb" }));
  
  // Security
  app.use(helmet());
  
  const allowedOrigins = env.ALLOWED_ORIGINS;
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }));
  
  app.use(passport.initialize());
  app.use(sanitizeInput);
  
  // Register custom middleware
  registerMiddleware(app);
  
  // Health check (before rate limiting)
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
  
  // API routes
  registerRoutes(app);
  
  // Error handling (last)
  app.use(errorHandler);
  
  return app;
}

export async function startServer() {
  const app = await createApp();
  
  const server = app.listen(env.PORT, () => {
    logger.info(`Server started on port ${env.PORT}`, { context: "Server" });
  });
  
  // Initialize background jobs (MT5, Finnhub, cleanup, etc.)
  await runStartupJobs();
  startBackgroundJobs();
  
  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down...`, { context: "Server" });
    server.close(async () => {
      await closePgClient();
      await closeRedisClient();
      logger.info("Shutdown complete");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 30000);
  };
  
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  
  return server;
}