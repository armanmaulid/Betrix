import { Router } from "express";
import { container } from "tsyringe";
import { MarketController } from "@presentation/controllers/MarketController.js";
import { authMiddleware } from "@presentation/middleware/auth.middleware.js";
import { validate } from "@presentation/middleware/validate.middleware.js";
import { getSymbolsDto, getCalendarDto } from "@modules/market/application/dto/market.dto.js";
import { z } from "zod";

export function createMarketRouter(): Router {
  const router = Router();
  const controller = container.resolve(MarketController);

  router.use(authMiddleware);

  // Symbol endpoints
  router.get("/symbols", validate(getSymbolsDto), controller.getSymbols.bind(controller));
  router.get("/symbols/:symbol", controller.getSymbolInfo.bind(controller));
  router.get("/symbols/category/:category", controller.getSymbolsByCategory.bind(controller));

  // Calendar endpoints
  router.get("/calendar", validate(getCalendarDto), controller.getCalendar.bind(controller));

  // Real-time market data endpoints — route STATIS (all) HARUS sebelum
  // parameterized (:symbol) — kalau tidak, "all" di-capture sebagai symbol
  // → 404 "Price/Market book not found for symbol: all".
  router.get("/prices/all", controller.getAllPrices.bind(controller));
  router.get("/prices/:symbol", controller.getPrice.bind(controller));

  router.get("/mbook/all", controller.getAllMarketBooks.bind(controller));
  router.get("/mbook/:symbol", controller.getMarketBook.bind(controller));

  // Validation schema for prices query
  const pricesQuerySchema = z.object({
    query: z.object({
      symbols: z.string().min(1)
    })
  });

  // Validation schema for OHLC query
  const ohlcQuerySchema = z.object({
    query: z.object({
      timeframe: z.string().min(1)
    })
  });

  // Validation schema for symbol params

  // Validation schema for OHLC params
  const ohlcParamSchema = z.object({
    params: z.object({
      symbol: z.string().min(1),
      timeframe: z.string().min(1)
    })
  });

  // Apply validation to price endpoints
  router.get("/prices", validate(pricesQuerySchema), controller.getPrices.bind(controller)); // ?symbols=EURUSD,GBPUSD
  router.get("/ohlc/all", validate(ohlcQuerySchema), controller.getAllOHLC.bind(controller)); // ?timeframe=M5
  router.get("/ohlc/:symbol/:timeframe", validate(ohlcParamSchema), controller.getOHLC.bind(controller));

  return router;
}