import { injectable, singleton } from "tsyringe";
import { env } from "@config/env.js";
import { logger } from "@core/logging/logger.js";
import { BrokerSymbol } from "@domain/entities/BrokerSymbol.js";
import { OHLCBar, Mt5CalendarEvent } from "@domain/ports/IBrokerProvider.js";

interface Mt5Symbol {
  name: string;
  trade_mode: number;
  description: string;
  path: string;
}

function transformMt5Symbol(s: Mt5Symbol): BrokerSymbol {
  const pathParts = s.path.split("\\");
  const category = pathParts.length >= 2 ? pathParts.slice(0, -1).join("\\") : s.path;
  
  return BrokerSymbol.create({
    symbol: s.name,
    description: s.description,
    path: s.path,
    category,
    isActive: s.trade_mode > 0, 
  });
}

@injectable()
@singleton()
export class Mt5HttpClient {
  private getHttpBase(): string {
    return env.MT5_HTTP_URL || `http://${env.MT5_BRIDGE_URL}`;
  }

  async trackPrices(symbols: string[]): Promise<void> {
    const response = await fetch(`${this.getHttpBase()}/v1/track/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols }),
    });
    if (!response.ok) {
      throw new Error(`Failed to track prices: ${response.statusText}`);
    }
  }

  async trackOHLC(requests: Array<{ symbol: string; timeframe: string; depth: number }>): Promise<void> {
    const response = await fetch(`${this.getHttpBase()}/v1/track/ohlc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ohlc: requests.map(r => ({ symbol: r.symbol, time_frame: r.timeframe, depth: r.depth })),
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to track OHLC: ${response.statusText}`);
    }
  }

  async trackMarketBook(symbols: string[]): Promise<void> {
    const response = await fetch(`${this.getHttpBase()}/v1/track/mbook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols }),
    });
    if (!response.ok) {
      throw new Error(`Failed to track market book: ${response.statusText}`);
    }
  }

  async trackCalendar(country?: string, currency?: string): Promise<void> {
    const response = await fetch(`${this.getHttpBase()}/v1/track/calendar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: country || "", currency: currency || "" }),
    });
    if (!response.ok) {
      throw new Error(`Failed to track calendar: ${response.statusText}`);
    }
  }

  private async fetchWithRetry<T>(url: string, maxRetries = 3, baseDelay = 2000): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json() as T;
      } catch (err) {
        logger.warn(`Request failed (attempt ${attempt}/${maxRetries})`, { context: "MT5", url, error: (err as Error).message });
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, baseDelay * attempt));
        }
      }
    }
    throw new Error(`Failed after ${maxRetries} retries: ${url}`);
  }

  async fetchSymbolCount(): Promise<number> {
    const data = await this.fetchWithRetry<{ count: number }>(`${this.getHttpBase()}/v1/symbol/count`);
    return data.count;
  }

  async fetchSymbols(): Promise<BrokerSymbol[]> {
    const maxRetries = 3;
    const baseDelay = 2000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.getHttpBase()}/v1/symbol/list`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json() as { symbols?: Mt5Symbol[] };
        const rawSymbols = data.symbols || [];
        
        if (rawSymbols.length > 0) {
          return rawSymbols.map(transformMt5Symbol);
        }
        
        logger.warn(`fetchSymbols returned empty array (attempt ${attempt}/${maxRetries})`, { context: "MT5" });
      } catch (err) {
        logger.warn(`fetchSymbols attempt ${attempt}/${maxRetries} failed`, { context: "MT5", error: (err as Error).message });
      }
      
      if (attempt < maxRetries) {
        const delay = baseDelay * attempt;
        logger.info(`Retrying fetchSymbols in ${delay}ms...`, { context: "MT5" });
        await new Promise(r => setTimeout(r, delay));
      }
    }
    
    logger.error("fetchSymbols failed after all retries", { context: "MT5" });
    return [];
  }

  async fetchCalendar(period = "today"): Promise<Mt5CalendarEvent[]> {
    const data = await this.fetchWithRetry<unknown>(`${this.getHttpBase()}/v1/calendar?period=${period}`);
    if (Array.isArray(data)) return data as Mt5CalendarEvent[];
    if (data && typeof data === "object" && "data" in data) {
      return (data as { data?: unknown }).data as Mt5CalendarEvent[] ?? [];
    }
    return [];
  }

  async fetchHistory(symbol: string, timeframe: string, fromDate: string, toDate: string): Promise<OHLCBar[]> {
    const url = `${this.getHttpBase()}/v1/history/prices?symbol=${encodeURIComponent(symbol)}&time_frame=${encodeURIComponent(timeframe)}&from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`;
    const data = await this.fetchWithRetry<{ data?: OHLCBar[] }>(url);
    return data.data ?? [];
  }
}
