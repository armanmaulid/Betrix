import type { Application } from "express";
import { globalLimiter, perUserLimiter } from "@core/middleware/rateLimiter.js";

export function registerMiddleware(app: Application) {
  // Global rate limiter
  app.use(globalLimiter);

  // Auth brute-force limiter (authLimiter) + register limiter applied
  // per-guest-route in auth.routes.ts — NOT blanket on /auth, which would
  // let an attacker lock out authenticated users (logout/me/profile) by
  // exhausting the shared per-IP bucket from one IP.

  // Per-user rate limiter for API routes (authenticated endpoints keyed by
  // userId; unauthenticated fall back to IP).
  app.use("/api/v1", (req, res, next) => {
    if (req.path.startsWith("/admin") || req.path.startsWith("/market")) {
      return next();
    }
    perUserLimiter(req, res, next);
  });
}