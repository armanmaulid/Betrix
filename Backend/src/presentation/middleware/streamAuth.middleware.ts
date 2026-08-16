import type { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import type { StreamTicketStore } from "@domain/repositories/StreamTicketStore.js";
import { findSessionByToken } from "./auth.middleware.js";

/**
 * Auth khusus route stream (SSE/EventSource):
 * - `?ticket=`  → ticket sekali pakai (TTL 60s) yang ditukar dari session token.
 *   Ticket di-burn saat connect, lalu session tetap divalidasi — logout
 *   langsung membatalkan ticket.
 * - `Authorization: Bearer` → path normal (klien non-EventSource).
 * - `?token=` di URL → DITOLAK (token di URL bocor ke access log/history/Referer);
 *   kalau `?ticket=` dan `?token=` keduanya ada → tolak, jangan fallback.
 */
export async function streamAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const ticket = typeof req.query.ticket === "string" ? req.query.ticket : null;
  const tokenInUrl = typeof req.query.token === "string" ? req.query.token : null;
  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (ticket && tokenInUrl) {
    return res.status(400).json({
      error: "Provide either a stream ticket or a session token, not both",
      code: "AMBIGUOUS_AUTH",
    });
  }

  try {
    if (ticket) {
      const ticketStore = container.resolve("StreamTicketStore") as StreamTicketStore;
      const sessionToken = await ticketStore.getAndDelete(ticket);
      if (!sessionToken) {
        return res.status(401).json({ error: "Invalid or expired stream ticket", code: "UNAUTHENTICATED" });
      }
      const session = await findSessionByToken(sessionToken);
      if (!session) {
        return res.status(401).json({ error: "Session not found or expired", code: "UNAUTHENTICATED" });
      }
      req.user = { userId: session.userId, token: session.token };
      return next();
    }

    if (bearerToken) {
      const session = await findSessionByToken(bearerToken);
      if (!session) {
        return res.status(401).json({ error: "Session not found or expired", code: "UNAUTHENTICATED" });
      }
      req.user = { userId: session.userId, token: session.token };
      return next();
    }

    if (tokenInUrl) {
      return res.status(400).json({
        error: "Session token in URL is not supported; request a stream ticket instead",
        code: "TOKEN_IN_URL_REJECTED",
      });
    }

    return res.status(401).json({ error: "Session token required", code: "UNAUTHENTICATED" });
  } catch (err) {
    next(err);
  }
}
