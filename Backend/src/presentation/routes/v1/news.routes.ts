import { Router } from "express";
import { container } from "tsyringe";
import { NewsController } from "@presentation/controllers/NewsController.js";
import { authMiddleware } from "@presentation/middleware/auth.middleware.js";

export function createNewsRouter(): Router {
  const router = Router();
  const controller = container.resolve(NewsController);

  router.get("/stream", authMiddleware, controller.stream.bind(controller));
  router.get("/", authMiddleware, controller.getNews.bind(controller));

  return router;
}
