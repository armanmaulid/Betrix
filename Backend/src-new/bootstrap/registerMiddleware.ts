import { Application } from "express";
import { globalLimiter, authLimiter, registerLimiter, perUserLimiter } from "@core/middleware/rateLimiter.js";

export function registerMiddleware(app: Application) {
  // Global rate limiter
  app.use(globalLimiter);
  
  // Auth rate limiter
  app.use("/api/v1/auth", authLimiter);
  app.use("/api/v1/auth/register", registerLimiter);
  
  // Per-user rate limiter for API routes
  app.use("/api/v1", (req, res, next) => {
    if (req.path.startsWith("/admin") || req.path.startsWith("/market")) {
      return next();
    }
    perUserLimiter(req, res, next);
  });
}