import type { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import { MarketDataService } from "@domain/services/MarketDataService.js";
import { CalendarService } from "@domain/services/CalendarService.js";

export class MarketController {
  private getMarketDataService() {
    return container.resolve(MarketDataService);
  }

  private getCalendarService() {
    return container.resolve(CalendarService);
  }

  async getPrice(req: Request, res: Response, next: NextFunction) {
    try {
      const { symbol } = req.params;
      const price = await this.getMarketDataService().getPrice(symbol.toUpperCase());
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
      const prices = await this.getMarketDataService().getPrices(symbolList);
      const result: Record<string, any> = {};
      prices.forEach((price, symbol) => { result[symbol] = price; });
      res.json({ prices: result });
    } catch (err) {
      next(err);
    }
  }

  async getOHLC(req: Request, res: Response, next: NextFunction) {
    try {
      const { symbol, timeframe } = req.params;
      const ohlc = await this.getMarketDataService().getOHLC(symbol.toUpperCase(), timeframe.toUpperCase());
      if (!ohlc) {
        return res.status(404).json({ error: "OHLC data not found", code: "NOT_FOUND" });
      }
      res.json(ohlc);
    } catch (err) {
      next(err);
    }
  }

  async getMarketBook(req: Request, res: Response, next: NextFunction) {
    try {
      const { symbol } = req.params;
      const mbook = await this.getMarketDataService().getMarketBook(symbol.toUpperCase());
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
      const symbols = await this.getMarketDataService().getSymbols(active !== "false");
      res.json({ symbols });
    } catch (err) {
      next(err);
    }
  }

  async getSymbolInfo(req: Request, res: Response, next: NextFunction) {
    try {
      const { symbol } = req.params;
      const info = await this.getMarketDataService().getSymbolInfo(symbol.toUpperCase());
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
      const symbols = await this.getMarketDataService().getSymbolsByCategory(category);
      res.json({ symbols });
    } catch (err) {
      next(err);
    }
  }

  async getAllPrices(req: Request, res: Response, next: NextFunction) {
    try {
      const prices = await this.getMarketDataService().getAllPrices();
      const result: Record<string, any> = {};
      prices.forEach((price: any) => { result[price.symbol] = price; });
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
      const ohlc = await this.getMarketDataService().getAllOHLC(timeframe as string);
      const result: Record<string, any> = {};
      ohlc.forEach((c: any) => { result[c.symbol] = c; });
      res.json({ ohlc: result });
    } catch (err) {
      next(err);
    }
  }

  async getAllMarketBooks(req: Request, res: Response, next: NextFunction) {
    try {
      const books = await this.getMarketDataService().getAllMarketBooks();
      const result: Record<string, any> = {};
      books.forEach((book: any) => { result[book.symbol] = book; });
      res.json({ marketBooks: result });
    } catch (err) {
      next(err);
    }
  }

  async getCalendar(req: Request, res: Response, next: NextFunction) {
    try {
      const { fromDate, toDate, country, currency, importance, limit } = req.query;
      const events = await this.getCalendarService().getCalendar({
        startDate: fromDate ? new Date(fromDate as string) : undefined,
        endDate: toDate ? new Date(toDate as string) : undefined,
        country: country as string,
        currency: currency as string,
        importance: importance as any,
        limit: limit ? parseInt(limit as string) : undefined
      });
      res.json({ events });
    } catch (err) {
      next(err);
    }
  }
}