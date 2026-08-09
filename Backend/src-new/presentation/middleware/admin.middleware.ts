import { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { AuthorizationError, AuthenticationError } from "@core/errors/index.js";

export async function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.user.userId) {
    return res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
  }

  try {
    const userRepo = container.resolve(UserRepository);
    const user = await userRepo.findById(req.user.userId);

    if (!user) {
      return res.status(401).json({ error: "User not found", code: "UNAUTHENTICATED" });
    }

    if (user.status !== "active") {
      return res.status(403).json({ error: `Account is ${user.status}`, code: "FORBIDDEN" });
    }

    if (!user.isAdmin) {
      return res.status(403).json({ error: "Admin access required", code: "FORBIDDEN" });
    }

    req.user = { ...req.user, ...user };
    next();
  } catch (err) {
    next(err);
  }
}