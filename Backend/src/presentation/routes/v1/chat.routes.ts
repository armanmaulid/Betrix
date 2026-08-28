import { Router } from "express";
import { container } from "tsyringe";
import { ChatController } from "@presentation/controllers/ChatController.js";
import { authMiddleware } from "@presentation/middleware/auth.middleware.js";
import { validate } from "@presentation/middleware/validate.middleware.js";
import { sendMessageDto, getHistoryDto, deleteSessionDto, exportHistoryDto } from "@modules/chat/application/dto/chat.dto.js";

export function createChatRouter(): Router {
  const router = Router();
  const controller = container.resolve(ChatController);

  router.post("/", authMiddleware, validate(sendMessageDto), controller.sendMessage.bind(controller));
  router.post("/stream", authMiddleware, validate(sendMessageDto), controller.streamMessage.bind(controller));
  router.get("/history", authMiddleware, validate(getHistoryDto), controller.getHistory.bind(controller));
  router.delete("/session/:sessionId", authMiddleware, validate(deleteSessionDto), controller.deleteSession.bind(controller));
  router.get("/export", authMiddleware, validate(exportHistoryDto), controller.exportHistory.bind(controller));

  return router;
}