import { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import { GetSymbolsUseCase } from "@application/use-cases/market/GetSymbolsUseCase.js";
import { GetCalendarUseCase } from "@application/use-cases/market/GetCalendarUseCase.js";

export class MarketController {
  async getSymbols(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetSymbolsUseCase);
      const result = await useCase.execute({
        category: req.query.category as string,
        activeOnly: req.query.activeOnly !== "false",
      });
      res.json({ symbols: result.symbols });
    } catch (err) {
      next(err);
    }
  }

  async getCalendar(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetCalendarUseCase);
      const result = await useCase.execute({
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        country: req.query.country as string,
        currency: req.query.currency as string,
        importance: req.query.importance as any,
        limit: parseInt(req.query.limit as string) || 100,
      });
      res.json({ events: result.events });
    } catch (err) {
      next(err);
    }
  }
}