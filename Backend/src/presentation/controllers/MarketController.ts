import type { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { MarketDataService } from "@modules/market/application/services/MarketDataService.js";
import { CalendarService } from "@modules/market/application/services/CalendarService.js";
import { CalendarImportance } from "@domain/entities/CalendarEvent.js";
import { queryString, queryStringArray, queryStringUpper } from "@shared/http/queryHelpers.js";

@injectable()
export class MarketController {
  constructor(
    @inject("MarketDataService") private marketDataService: MarketDataService,
    @inject("CalendarService") private calendarService: CalendarService
  ) {}

  async getPrice(req: Request, res: Response, next: NextFunction) {
    try {
      const symbol = (req.params.symbol as string).toUpperCase();
      const price = await this.marketDataService.getPrice(symbol);
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
      const symbols = queryString(req.query.symbols);
      if (!symbols) {
        return res.status(400).json({ error: "symbols query parameter required", code: "VALIDATION_ERROR" });
      }
      const symbolList = symbols.split(",").map(s => s.trim().toUpperCase());
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
      const symbol = (req.params.symbol as string).toUpperCase();
      const timeframe = (req.params.timeframe as string).toUpperCase();
      const candles = await this.marketDataService.getOHLC(symbol, timeframe);
      if (candles.length === 0) {
        return res.status(404).json({ error: "OHLC data not found", code: "NOT_FOUND" });
      }
      res.json({ symbol, timeframe, candles });
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
      const symbol = (req.params.symbol as string).toUpperCase();
      const mbook = await this.marketDataService.getMarketBook(symbol);
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
      const active = queryString(req.query.active);
      const symbols = await this.marketDataService.getSymbols(active !== "false");
      res.json({ symbols });
    } catch (err) {
      next(err);
    }
  }

  async getSymbolInfo(req: Request, res: Response, next: NextFunction) {
    try {
      const symbol = (req.params.symbol as string).toUpperCase();
      const info = await this.marketDataService.getSymbolInfo(symbol);
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
      const { category } = req.params as { category: string };
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
      const timeframe = queryString(req.query.timeframe);
      if (!timeframe) {
        return res.status(400).json({ error: "timeframe query parameter required", code: "VALIDATION_ERROR" });
      }
      const ohlc = await this.marketDataService.getAllOHLC(timeframe);
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
      const fromDate = queryString(req.query.fromDate);
      const toDate = queryString(req.query.toDate);
      const country = queryString(req.query.country);
      const currency = queryString(req.query.currency);
      const importance = queryString(req.query.importance) as CalendarImportance | undefined;
      const limitStr = queryString(req.query.limit);
      const events = await this.calendarService.getCalendar({
        startDate: fromDate ? new Date(fromDate) : undefined,
        endDate: toDate ? new Date(toDate) : undefined,
        country,
        currency,
        importance,
        limit: limitStr ? parseInt(limitStr) : undefined
      });
      res.json({ events });
    } catch (err) {
      next(err);
    }
  }
}