import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "@config/env";
import type { Request } from "express";

function createIpKeyGenerator() {
  return (req: Request) => ipKeyGenerator(req.ip || "unknown");
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
  keyGenerator?: (req: Request) => string;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: { error: options.message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator || createIpKeyGenerator(),
  });
}

export const globalLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: env.RATE_LIMIT_PER_MINUTE,
  message: "Terlalu banyak request, coba lagi sebentar lagi",
});

export const authLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: "Terlalu banyak percobaan login/register, coba lagi dalam 5 menit",
});

export const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: env.RATE_LIMIT_REGISTER_PER_HOUR,
  message: "Terlalu banyak percobaan registrasi, coba lagi nanti",
});

export const perUserLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: env.RATE_LIMIT_PER_USER_PER_MINUTE,
  message: "Terlalu banyak request untuk akun ini, coba lagi sebentar lagi",
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    return userId ? `user:${userId}` : ipKeyGenerator(req.ip || "unknown");
  },
});