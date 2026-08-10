import { Request, Response, NextFunction } from "express";
import { logger } from "../logging/logger.js";
import { AppError, isAppError } from "../errors/index.js";
import { env } from "@config/env";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.id || "unknown";

  if (isAppError(err)) {
    const logLevel = err.statusCode >= 500 ? "error" : "warn";
    logger[logLevel](err.message, {
      context: "ErrorHandler",
      code: err.code,
      statusCode: err.statusCode,
      details: err.details,
      requestId,
      stack: err.stack,
    });

    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.details && { details: err.details }),
      requestId,
    });
  }

  // Unknown error
  logger.error("Unhandled error", {
    context: "ErrorHandler",
    error: err.message,
    stack: err.stack,
    requestId,
  });

  const message = env.NODE_ENV === "production" 
    ? "Internal server error" 
    : err.message;

  return res.status(500).json({
    error: message,
    code: "INTERNAL_ERROR",
    requestId,
  });
}