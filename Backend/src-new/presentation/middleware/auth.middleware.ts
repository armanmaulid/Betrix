import { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { AuthenticationError } from "@core/errors/index.js";

declare global {
  namespace Express {
    interface Request {
      user?: any;
      id?: string;
      normalizedIP?: string;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || "";
  const sessionToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!sessionToken) {
    return res.status(401).json({ error: "Session token required", code: "UNAUTHENTICATED" });
  }

  try {
    const sessionRepo = container.resolve(SessionRepository);
    const session = await sessionRepo.findByToken(sessionToken);

    if (!session) {
      return res.status(401).json({ error: "Session not found or expired", code: "UNAUTHENTICATED" });
    }

    req.user = session;
    next();
  } catch (err) {
    next(err);
  }
}