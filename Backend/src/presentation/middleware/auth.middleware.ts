import type { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import type { SessionRepository } from "@domain/repositories/SessionRepository.js";

export interface AuthenticatedRequest extends Request {
  id?: string;
  user: {
    userId: string;
    token: string;
  };
}

/**
 * Cari session dari raw token (dipakai authMiddleware & streamAuthMiddleware).
 * Dipisah agar logika lookup tidak diduplikasi.
 */
export async function findSessionByToken(sessionToken: string) {
  const sessionRepo = container.resolve("SessionRepository") as SessionRepository;
  return sessionRepo.findByToken(sessionToken);
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || "";
  // Token sesi TIDAK diterima lagi dari query string (Phase 2 — token di URL
  // bocor ke access log/history/Referer). Route stream SSE pakai ?ticket= via
  // streamAuthMiddleware; semua route lain memakai header Bearer.
  const sessionToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!sessionToken) {
    return res.status(401).json({ error: "Session token required", code: "UNAUTHENTICATED" });
  }

  try {
    const sessionRepo = container.resolve("SessionRepository") as SessionRepository;
    const session = await sessionRepo.findByToken(sessionToken);

    if (!session) {
      return res.status(401).json({ error: "Session not found or expired", code: "UNAUTHENTICATED" });
    }

    req.user = {
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
  // Sama seperti authMiddleware: Bearer saja, tanpa fallback ?token= di URL.
  const sessionToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

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
  } catch {
    next(); // if there is an error checking the session, let them proceed
  }
}