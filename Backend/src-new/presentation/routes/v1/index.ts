import { Router } from "express";
import authRoutes from "./auth.routes.js";
import chatRoutes from "./chat.routes.js";
import adminRoutes from "./admin.routes.js";
import userRoutes from "./user.routes.js";
import marketRoutes from "./market.routes.js";
import healthRoutes from "./health.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/chat", chatRoutes);
router.use("/admin", adminRoutes);
router.use("/me", userRoutes);
router.use("/market", marketRoutes);
router.use("/", healthRoutes);

export default router;