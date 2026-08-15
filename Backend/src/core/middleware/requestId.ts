import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express namespace augmentation is required by @types/express
  namespace Express {
    interface User {
      id?: string;
      userId?: string;
      token?: string;
    }
    interface Request {
      id?: string;
      normalizedIP?: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  req.id = req.header("X-Request-ID") || crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  next();
}