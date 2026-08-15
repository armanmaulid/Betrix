import { Router } from "express";
import { container } from "tsyringe";
import { UserController } from "@presentation/controllers/UserController.js";
import { authMiddleware } from "@presentation/middleware/auth.middleware.js";
import { validate } from "@presentation/middleware/validate.middleware.js";
import { getUsageDto, getMessagesDto, sendMessageDto, updateNotificationPrefsDto, getActivityDto } from "@application/dtos/user.dto.js";

export function createUserRouter(): Router {
  const router = Router();
  const controller = container.resolve(UserController);

  router.use(authMiddleware);

  router.get("/activity", validate(getActivityDto), controller.getActivity.bind(controller));

  router.get("/usage/me", validate(getUsageDto), controller.getUsage.bind(controller));
  router.get("/usage/current-month", controller.getUsage.bind(controller)); // Simplified

  // Route statis HARUS sebelum "/messages/:id" — kalau tidak, "preferences"
  // / "sent" / "thread" di-capture sebagai :id (500 uuid parse error).
  router.get("/messages", validate(getMessagesDto), controller.getMessages.bind(controller));
  router.get("/messages/sent", validate(getMessagesDto), controller.getSentMessages.bind(controller));
  router.get("/messages/preferences", controller.getNotificationPrefs.bind(controller));
  router.post("/messages/preferences", validate(updateNotificationPrefsDto), controller.updateNotificationPrefs.bind(controller));
  router.get("/messages/thread/:threadId", controller.getMessageThread.bind(controller));
  router.get("/messages/:id", controller.getMessageDetail.bind(controller));
  router.post("/messages/:id/read", controller.markMessageRead.bind(controller));
  router.delete("/messages/:id", controller.deleteMessage.bind(controller));
  router.post("/messages", validate(sendMessageDto), controller.sendMessage.bind(controller));

  return router;
}