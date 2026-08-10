import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { logger } from "./logger.js";

const SENSITIVE_QUERY_PARAMS = ["token", "sessionToken", "apikey", "api_key"];

function redactSensitiveQuery(originalUrl: string): string {
  if (!originalUrl || !originalUrl.includes("?")) return originalUrl;

  const [path, query] = originalUrl.split("?");
  const params = new URLSearchParams(query);
  let redacted = false;

  for (const key of SENSITIVE_QUERY_PARAMS) {
    if (params.has(key)) {
      params.set(key, "[REDACTED]");
      redacted = true;
    }
  }

  return redacted ? `${path}?${params.toString()}` : originalUrl;
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  req.id = req.header("X-Request-ID") || crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);

  const loggedPath = redactSensitiveQuery(req.originalUrl || req.path);

  logger.debug("incoming request", {
    method: req.method,
    path: loggedPath,
    userId: (req as any).user?.id,
    ip: (req as any).normalizedIP || req.ip,
    requestId: req.id,
  });

  res.on("finish", () => {
    const duration = Date.now() - start;

    if (res.statusCode >= 500) {
      logger.error("request completed", {
        method: req.method,
        path: loggedPath,
        userId: (req as any).user?.id,
        statusCode: res.statusCode,
        duration,
        requestId: req.id,
      });
    } else if (res.statusCode >= 400) {
      logger.warn("request completed", {
        method: req.method,
        path: loggedPath,
        userId: (req as any).user?.id,
        statusCode: res.statusCode,
        duration,
        requestId: req.id,
      });
    } else {
      logger.debug("request completed", {
        method: req.method,
        path: loggedPath,
        userId: (req as any).user?.id,
        statusCode: res.statusCode,
        duration,
        requestId: req.id,
      });
    }
  });

  next();
}