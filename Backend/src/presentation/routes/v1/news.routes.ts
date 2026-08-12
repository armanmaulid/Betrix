import { Router } from "express";
import { NewsController } from "@presentation/controllers/NewsController.js";
import { authMiddleware } from "@presentation/middleware/auth.middleware.js";

const router = Router();
const controller = new NewsController();

router.get("/stream", authMiddleware, controller.stream.bind(controller));
router.get("/", authMiddleware, controller.getNews.bind(controller));

export default router;
