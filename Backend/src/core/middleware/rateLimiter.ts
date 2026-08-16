import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "@config/env";
import type { Request, Response } from "express";
import { logger } from "@core/logging/logger.js";

function createIpKeyGenerator() {
  return (req: Request) => ipKeyGenerator(req.normalizedIP || req.ip || "unknown");
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
  name?: string;
  keyGenerator?: (req: Request) => string;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: { error: options.message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator || createIpKeyGenerator(),
    handler: (req: Request, res: Response) => {
      const ip = req.normalizedIP || req.ip || "unknown";
      logger.warn(`Rate limit exceeded`, {
        context: "RateLimit",
        limiter: options.name || "global",
        ip,
        method: req.method,
        path: req.originalUrl || req.path,
        maxRequests: options.max,
        windowMs: options.windowMs,
      });
      res.status(429).json({ error: options.message });
    },
  });
}

export const globalLimiter = createRateLimiter({
  name: "global",
  windowMs: 60 * 1000,
  max: env.RATE_LIMIT_PER_MINUTE,
  message: "Too many requests, please try again shortly",
});

export const authLimiter = createRateLimiter({
  name: "auth",
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: "Too many login/register attempts, please try again in 5 minutes",
});

export const registerLimiter = createRateLimiter({
  name: "register",
  windowMs: 60 * 60 * 1000,
  max: env.RATE_LIMIT_REGISTER_PER_HOUR,
  message: "Too many registration attempts, please try again later",
});

export const perUserLimiter = createRateLimiter({
  name: "per-user",
  windowMs: 60 * 1000,
  max: env.RATE_LIMIT_PER_USER_PER_MINUTE,
  message: "Too many requests for this account, please try again shortly",
  keyGenerator: (req) => {
    const userId = req.user?.userId;
    return userId ? `user:${userId}` : ipKeyGenerator(req.normalizedIP || req.ip || "unknown");
  },
});

// Sensitive authenticated ops (change-email sends SMTP, change-password lets
// an attacker brute-force currentPassword). Strict per-userId: 3/hour so a
// logged-in abuser can't email-bomb arbitrary addresses or guess passwords.
// ponytail: ceiling 3/hour; raise only if legit UX friction reported.
export const sensitiveLimiter = createRateLimiter({
  name: "sensitive",
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: "Too many sensitive operation attempts, please try again in 1 hour",
  keyGenerator: (req) => {
    const userId = req.user?.userId;
    return userId ? `sensitive:${userId}` : ipKeyGenerator(req.normalizedIP || req.ip || "unknown");
  },
});