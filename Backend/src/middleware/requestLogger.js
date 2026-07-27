import { logger } from "../utils/logger.js";
import crypto from "crypto";

export function requestLogger(req, res, next) {
  const start = Date.now();
  req.id = req.header("X-Request-ID") || crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);

  logger.debug("incoming request", {
    method: req.method,
    path: req.originalUrl || req.path,
    userId: req.user?.id,
    ip: req.normalizedIP || req.ip,
    requestId: req.id,
  });

  res.on("finish", () => {
    const duration = Date.now() - start;

    if (res.statusCode >= 500) {
      logger.error("request completed", {
        method: req.method,
        path: req.originalUrl || req.path,
        userId: req.user?.id,
        statusCode: res.statusCode,
        duration,
        requestId: req.id,
      });
    } else if (res.statusCode >= 400) {
      logger.warn("request completed", {
        method: req.method,
        path: req.originalUrl || req.path,
        userId: req.user?.id,
        statusCode: res.statusCode,
        duration,
        requestId: req.id,
      });
    } else {
      logger.debug("request completed", {
        method: req.method,
        path: req.originalUrl || req.path,
        userId: req.user?.id,
        statusCode: res.statusCode,
        duration,
        requestId: req.id,
      });
    }
  });

  next();
}
