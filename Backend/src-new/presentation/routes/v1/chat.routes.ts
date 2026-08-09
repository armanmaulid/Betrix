import { Router } from "express";
import { container } from "tsyringe";
import { ChatController } from "@presentation/controllers/ChatController.js";
import { authMiddleware } from "@presentation/middleware/auth.middleware.js";
import { requireCredits } from "@presentation/middleware/credits.middleware.js";
import { validate } from "@presentation/middleware/validate.middleware.js";
import { sendMessageDto, getHistoryDto, deleteSessionDto, exportHistoryDto } from "@application/dtos/chat.dto.js";
import { CreditAction } from "@domain/entities/CreditTransaction.js";
import { TASK_TIER_MAP, TIER_CREDIT_COST } from "@config/models.js";

const router = Router();
const controller = container.resolve(ChatController);

function checkChatCredits(req: any, res: any, next: any) {
  const taskType = req.body.taskType || "general";
  const tier = req.body.tier || TASK_TIER_MAP[taskType] || "balanced";
  const cost = TIER_CREDIT_COST[tier];
  return requireCredits(cost, `chat_${tier}` as CreditAction)(req, res, next);
}

router.post("/chat", authMiddleware, validate(sendMessageDto), checkChatCredits, controller.sendMessage.bind(controller));
router.post("/chat/stream", authMiddleware, validate(sendMessageDto), checkChatCredits, controller.streamMessage.bind(controller));
router.get("/chat/history", authMiddleware, validate(getHistoryDto), controller.getHistory.bind(controller));
router.delete("/chat/session/:sessionId", authMiddleware, validate(deleteSessionDto), controller.deleteSession.bind(controller));
router.get("/chat/export", authMiddleware, validate(exportHistoryDto), controller.exportHistory.bind(controller));

export default router;