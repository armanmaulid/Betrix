import { Router } from "express";
import { createAuthRouter } from "./auth.routes.js";
import { createChatRouter } from "./chat.routes.js";
import { createAdminRouter } from "./admin.routes.js";
import { createUserRouter } from "./user.routes.js";
import { createMarketRouter } from "./market.routes.js";
import healthRoutes from "./health.routes.js";
import { createNewsRouter } from "./news.routes.js";

// Routers dibangun saat registerRoutes(app) dipanggil — SETELAH
// registerDependencies() — sehingga container.resolve(Controller)
// di dalam factory tidak pernah kena container kosong (ESM hoisting).
export function createV1Router(): Router {
  const router = Router();

  router.use("/auth", createAuthRouter());
  router.use("/chat", createChatRouter());
  router.use("/admin", createAdminRouter());
  router.use("/me", createUserRouter());
  router.use("/market", createMarketRouter());
  router.use("/news", createNewsRouter());
  router.use("/", healthRoutes);

  return router;
}