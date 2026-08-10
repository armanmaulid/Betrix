import { Router } from "express";
import { container } from "tsyringe";
import { UserController } from "@presentation/controllers/UserController.js";
import { authMiddleware } from "@presentation/middleware/auth.middleware.js";
import { validate } from "@presentation/middleware/validate.middleware.js";
import { getUsageDto, getMessagesDto, sendMessageDto, updateNotificationPrefsDto } from "@application/dtos/user.dto.js";

const router = Router();
const controller = container.resolve(UserController);

router.use(authMiddleware);

router.get("/usage/me", validate(getUsageDto), controller.getUsage.bind(controller));
router.get("/usage/current-month", controller.getUsage.bind(controller)); // Simplified

router.get("/messages", validate(getMessagesDto), controller.getMessages.bind(controller));
router.post("/messages", validate(sendMessageDto), controller.sendMessage.bind(controller));
router.get("/messages/preferences", controller.updateNotificationPrefs.bind(controller)); // GET
router.post("/messages/preferences", validate(updateNotificationPrefsDto), controller.updateNotificationPrefs.bind(controller));

export default router;