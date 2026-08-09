import { Router } from "express";
import { container } from "tsyringe";
import { MarketController } from "@presentation/controllers/MarketController.js";
import { authMiddleware } from "@presentation/middleware/auth.middleware.js";
import { validate } from "@presentation/middleware/validate.middleware.js";
import { getSymbolsDto, getCalendarDto } from "@application/dtos/market.dto.js";

const router = Router();
const controller = container.resolve(MarketController);

router.use(authMiddleware);

router.get("/symbols", validate(getSymbolsDto), controller.getSymbols.bind(controller));
router.get("/calendar", validate(getCalendarDto), controller.getCalendar.bind(controller));

export default router;