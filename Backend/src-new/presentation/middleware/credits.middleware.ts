import { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import { CreditRepository } from "@domain/repositories/CreditRepository.js";
import { CreditAction } from "@domain/entities/CreditTransaction.js";
import { InsufficientCreditsError } from "@core/errors/index.js";

export function requireCredits(cost: number, action: CreditAction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !("userId" in req.user)) {
      return res.status(401).json({ error: "Unauthorized", code: "UNAUTHENTICATED" });
    }

    try {
      const creditRepo = container.resolve("CreditRepository") as CreditRepository;
      const userId = (req.user as any).userId;
      const newBalance = await creditRepo.deduct(userId, cost, action);
      (req as any).newCreditBalance = newBalance;
      (req as any).creditsDeducted = { amount: cost, action };
      next();
    } catch (err) {
      if (err instanceof Error && err.message === "Insufficient credits") {
        return res.status(402).json({ error: "Insufficient credits to perform this action", code: "INSUFFICIENT_CREDITS" });
      }
      next(err);
    }
  };
}