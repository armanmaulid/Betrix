import { Router } from "express";
import { container } from "tsyringe";
import { ChatController } from "@presentation/controllers/ChatController.js";
import { authMiddleware } from "@presentation/middleware/auth.middleware.js";
import { validate } from "@presentation/middleware/validate.middleware.js";
import { sendMessageDto, getHistoryDto, deleteSessionDto, exportHistoryDto } from "@application/dtos/chat.dto.js";

const router = Router();
const controller = container.resolve(ChatController);

router.post("/chat", authMiddleware, validate(sendMessageDto), controller.sendMessage.bind(controller));
router.post("/chat/stream", authMiddleware, validate(sendMessageDto), controller.streamMessage.bind(controller));
router.get("/chat/history", authMiddleware, validate(getHistoryDto), controller.getHistory.bind(controller));
router.delete("/chat/session/:sessionId", authMiddleware, validate(deleteSessionDto), controller.deleteSession.bind(controller));
router.get("/chat/export", authMiddleware, validate(exportHistoryDto), controller.exportHistory.bind(controller));

export default router;