import type { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { MarketDataService } from "@modules/market/application/services/MarketDataService.js";
import { CalendarService } from "@modules/market/application/services/CalendarService.js";
import { CalendarImportance } from "@domain/entities/CalendarEvent.js";

@injectable()
export class MarketController {
  constructor(
    @inject("MarketDataService") private marketDataService: MarketDataService,
    @inject("CalendarService") private calendarService: CalendarService
  ) {}

  async getPrice(req: Request, res: Response, next: NextFunction) {
    try {
      const { symbol } = req.params;
      const price = await this.marketDataService.getPrice(symbol.toUpperCase());
      if (!price) {
        return res.status(404).json({ error: "Price not found for symbol", code: "NOT_FOUND" });
      }
      res.json(price);
    } catch (err) {
      next(err);
    }
  }

  async getPrices(req: Request, res: Response, next: NextFunction) {
    try {
      const { symbols } = req.query;
      if (!symbols) {
        return res.status(400).json({ error: "symbols query parameter required", code: "VALIDATION_ERROR" });
      }
      const symbolList = (symbols as string).split(",").map(s => s.trim().toUpperCase());
      const prices = await this.marketDataService.getPrices(symbolList);
      const result: Record<string, unknown> = {};
      prices.forEach((price, symbol) => { result[symbol] = price; });
      res.json({ prices: result });
    } catch (err) {
      next(err);
    }
  }

  async getOHLC(req: Request, res: Response, next: NextFunction) {
    try {
      const { symbol, timeframe } = req.params;
      const candles = await this.marketDataService.getOHLC(symbol.toUpperCase(), timeframe.toUpperCase());
      if (candles.length === 0) {
        return res.status(404).json({ error: "OHLC data not found", code: "NOT_FOUND" });
      }
      res.json({ symbol: symbol.toUpperCase(), timeframe: timeframe.toUpperCase(), candles });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("Failed after") || msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
        return res.status(503).json({ error: "MT5 bridge unavailable", code: "BROKER_UNAVAILABLE" });
      }
      next(err);
    }
  }

  async getMarketBook(req: Request, res: Response, next: NextFunction) {
    try {
      const { symbol } = req.params;
      const mbook = await this.marketDataService.getMarketBook(symbol.toUpperCase());
      if (!mbook) {
        return res.status(404).json({ error: "Market book not found", code: "NOT_FOUND" });
      }
      res.json(mbook);
    } catch (err) {
      next(err);
    }
  }

  async getSymbols(req: Request, res: Response, next: NextFunction) {
    try {
      const { active } = req.query;
      const symbols = await this.marketDataService.getSymbols(active !== "false");
      res.json({ symbols });
    } catch (err) {
      next(err);
    }
  }

  async getSymbolInfo(req: Request, res: Response, next: NextFunction) {
    try {
      const { symbol } = req.params;
      const info = await this.marketDataService.getSymbolInfo(symbol.toUpperCase());
      if (!info) {
        return res.status(404).json({ error: "Symbol not found", code: "NOT_FOUND" });
      }
      res.json(info);
    } catch (err) {
      next(err);
    }
  }

  async getSymbolsByCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { category } = req.params;
      const symbols = await this.marketDataService.getSymbolsByCategory(category);
      res.json({ symbols });
    } catch (err) {
      next(err);
    }
  }

  async getAllPrices(req: Request, res: Response, next: NextFunction) {
    try {
      const prices = await this.marketDataService.getAllPrices();
      const result: Record<string, unknown> = {};
      prices.forEach((price) => { result[price.symbol] = price; });
      res.json({ prices: result });
    } catch (err) {
      next(err);
    }
  }

  async getAllOHLC(req: Request, res: Response, next: NextFunction) {
    try {
      const { timeframe } = req.query;
      if (!timeframe) {
        return res.status(400).json({ error: "timeframe query parameter required", code: "VALIDATION_ERROR" });
      }
      const ohlc = await this.marketDataService.getAllOHLC(timeframe as string);
      const result: Record<string, unknown> = {};
      ohlc.forEach((c) => { result[(c as { symbol: string }).symbol] = c; });
      res.json({ ohlc: result });
    } catch (err) {
      next(err);
    }
  }

  async getAllMarketBooks(req: Request, res: Response, next: NextFunction) {
    try {
      const books = await this.marketDataService.getAllMarketBooks();
      const result: Record<string, unknown> = {};
      books.forEach((book) => { result[(book as { symbol: string }).symbol] = book; });
      res.json({ marketBooks: result });
    } catch (err) {
      next(err);
    }
  }

  async getCalendar(req: Request, res: Response, next: NextFunction) {
    try {
      const { fromDate, toDate, country, currency, importance, limit } = req.query;
      const events = await this.calendarService.getCalendar({
        startDate: fromDate ? new Date(fromDate as string) : undefined,
        endDate: toDate ? new Date(toDate as string) : undefined,
        country: country as string,
        currency: currency as string,
        importance: importance as CalendarImportance | undefined,
        limit: limit ? parseInt(limit as string) : undefined
      });
      res.json({ events });
    } catch (err) {
      next(err);
    }
  }
}