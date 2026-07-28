import { deductCredits } from "../services/creditStore.js";

export const requireCredits = (cost, actionName) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    try {
      req.newCreditBalance = await deductCredits(req.user.id, cost, actionName);
      // Dipakai handler untuk refund kalau aksi setelah ini gagal — lihat
      // catatan FIX di creditStore.js/refundCredits().
      req.creditsDeducted = { amount: cost, action: actionName };
      next();
    } catch (err) {
      if (err.message === "Insufficient credits") {
        return res.status(402).json({ error: "Insufficient credits to perform this action." });
      }
      next(err);
    }
  };
};
