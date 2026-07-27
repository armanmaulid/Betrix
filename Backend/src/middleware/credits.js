import { deductCredits } from "../services/creditStore.js";

export const requireCredits = (cost, actionName) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    try {
      req.newCreditBalance = await deductCredits(req.user.id, cost, actionName);
      next();
    } catch (err) {
      if (err.message === "Insufficient credits") {
        return res.status(402).json({ error: "Insufficient credits to perform this action." });
      }
      next(err);
    }
  };
};
