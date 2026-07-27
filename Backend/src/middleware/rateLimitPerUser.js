import rateLimit from "express-rate-limit";

export const perUserLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PER_USER_PER_MINUTE) || 30,
  keyGenerator: (req, res) => {
    if (req.user?.id) return `user:${req.user.id}`;
    return res.locals.ipKeyGenerator(req);
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak request untuk akun ini, coba lagi sebentar lagi" },
});
