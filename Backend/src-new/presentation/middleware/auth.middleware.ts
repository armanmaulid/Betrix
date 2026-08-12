import type { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import type { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { Session } from "@domain/entities/Session.js";
import { AuthenticationError } from "@core/errors/index.js";

export interface AuthenticatedRequest extends Request {
  id?: string;
  user: {
    userId: string;
    token: string;
    [key: string]: any;
  };
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || "";
  const sessionToken = authHeader.startsWith("Bearer ") 
    ? authHeader.slice(7) 
    : (req.query.token as string || null);

  if (!sessionToken) {
    return res.status(401).json({ error: "Session token required", code: "UNAUTHENTICATED" });
  }

  try {
    const sessionRepo = container.resolve("SessionRepository") as SessionRepository;
    const session = await sessionRepo.findByToken(sessionToken);

    if (!session) {
      return res.status(401).json({ error: "Session not found or expired", code: "UNAUTHENTICATED" });
    }

    (req as any).user = {
      userId: session.userId,
      token: session.token,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export async function guestMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || "";
  const sessionToken = authHeader.startsWith("Bearer ") 
    ? authHeader.slice(7) 
    : (req.query.token as string || null);

  if (!sessionToken) {
    return next();
  }

  try {
    const sessionRepo = container.resolve("SessionRepository") as SessionRepository;
    const session = await sessionRepo.findByToken(sessionToken);

    if (session) {
      return res.status(400).json({ error: "Already logged in", code: "ALREADY_AUTHENTICATED" });
    }

    next();
  } catch (err) {
    next(); // if there is an error checking the session, let them proceed
  }
}