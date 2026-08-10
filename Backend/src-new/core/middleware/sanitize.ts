import { Request, Response, NextFunction } from "express";
import xss from "xss";

const xssOptions = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script"],
};

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return xss(value, xssOptions);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      sanitized[key] = sanitizeValue(val);
    }
    return sanitized;
  }
  return value;
}

export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  if (req.body) {
    req.body = sanitizeValue(req.body) as typeof req.body;
  }
  if (req.query) {
    req.query = sanitizeValue(req.query) as typeof req.query;
  }
  if (req.params) {
    req.params = sanitizeValue(req.params) as typeof req.params;
  }
  next();
}