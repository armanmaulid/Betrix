import { Router } from "express";
import { container } from "tsyringe";
import { NewsController } from "@presentation/controllers/NewsController.js";
import { authMiddleware } from "@presentation/middleware/auth.middleware.js";
import { streamAuthMiddleware } from "@presentation/middleware/streamAuth.middleware.js";

export function createNewsRouter(): Router {
  const router = Router();
  const controller = container.resolve(NewsController);

  // SSE pakai streamAuthMiddleware: ?ticket= sekali pakai, ?token= di URL ditolak
  router.get("/stream", streamAuthMiddleware, controller.stream.bind(controller));
  router.get("/", authMiddleware, controller.getNews.bind(controller));

  return router;
}
