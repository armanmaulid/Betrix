import { Router } from "express";
import { container } from "tsyringe";
import { AdminController } from "@presentation/controllers/AdminController.js";
import { authMiddleware } from "@presentation/middleware/auth.middleware.js";
import { adminMiddleware } from "@presentation/middleware/admin.middleware.js";
import { validate } from "@presentation/middleware/validate.middleware.js";
import { adminGetUsersDto, adminUpdateUserDto, adminResetPasswordDto, adminMetricsDto, adminAnalyticsDto, adminLogsDto, adminActionsDto, adminBroadcastDto } from "@application/dtos/admin.dto.js";

const router = Router();
const controller = container.resolve(AdminController);

router.use(authMiddleware, adminMiddleware);

router.get("/me", controller.getUserDetail.bind(controller));
router.patch("/me", controller.updateUser.bind(controller)); // Self-profile update

router.get("/users", validate(adminGetUsersDto), controller.getUsers.bind(controller));
router.get("/users/:id", controller.getUserDetail.bind(controller));
router.put("/users/:id", validate(adminUpdateUserDto), controller.updateUser.bind(controller));
router.delete("/users/:id", controller.deleteUser.bind(controller));
router.post("/users/:id/reset-password", validate(adminResetPasswordDto), controller.resetPassword.bind(controller));

router.get("/metrics", validate(adminMetricsDto), controller.getMetrics.bind(controller));
router.get("/analytics", validate(adminAnalyticsDto), controller.getAnalytics.bind(controller));
router.get("/system", controller.getSystemInfo.bind(controller));

router.get("/logs", validate(adminLogsDto), controller.getAuditLogs.bind(controller)); // Simplified
router.get("/actions", validate(adminActionsDto), controller.getAuditLogs.bind(controller));
router.get("/actions/export", validate(adminActionsDto), controller.exportAuditLogs.bind(controller));

router.post("/broadcast", validate(adminBroadcastDto), controller.broadcast.bind(controller));

export default router;