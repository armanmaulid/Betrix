import { inject, injectable } from "tsyringe";
import { MarketDataService } from "./MarketDataService.js";
import { TradeAnalysisPromptBuilder } from "@domain/services/TradeAnalysisPromptBuilder.js";
import { NewsContextPort } from "@contexts/news/domain/NewsContextPort.js";
import { AppError } from "@core/errors/index.js";

export interface TradeAnalysisContext {
  type: "market_analysis";
  symbol: string;
  timeframe: string;
}

export interface NewsContext {
  type: "news_context";
  assets: string[];
}

export type ContextParams = TradeAnalysisContext | NewsContext;

/**
 * Orchestrasi konteks prompt untuk chat — mengambil data MT5/berita secara internal
 * dan menyusun blok context via {@link TradeAnalysisPromptBuilder}.
 *
 * Dipakai oleh StreamMessageUseCase & SendMessageUseCase. Menutup data spoofing
 * (candle diambil backend, bukan dari klien) + prompt injection (template privat).
 */
@injectable()
export class TradeAnalysisContextService {
  constructor(
    @inject("MarketDataService") private marketDataService: MarketDataService,
    @inject("NewsContextPort") private newsContextPort: NewsContextPort,
    @inject("TradeAnalysisPromptBuilder") private promptBuilder: TradeAnalysisPromptBuilder
  ) {}

  /**
   * Bangun blok context (atau "" bila tidak ada contextParams).
   * Throw AppError(SYMBOL_NOT_FOUND) bila simbol tak dikenal broker.
   * MT5 down → fallback [DATA PASAR TIDAK TERSEDIA] (bukan 5xx).
   */
  async buildContext(contextParams: ContextParams | undefined): Promise<string> {
    if (!contextParams) return "";

    if (contextParams.type === "market_analysis") {
      return this.buildMarketContext(contextParams);
    }
    return this.buildNewsContext(contextParams);
  }

  private async buildMarketContext(ctx: TradeAnalysisContext): Promise<string> {
    const info = await this.marketDataService.getSymbolInfo(ctx.symbol);
    if (!info) {
      throw new AppError("SYMBOL_NOT_FOUND", 400, `Symbol not found: ${ctx.symbol}`);
    }

    let candles;
    try {
      candles = await this.marketDataService.getOHLC(ctx.symbol, ctx.timeframe);
    } catch (err) {
      // Bridge down (ECONNREFUSED / fetch failed) → context fallback, LLM tetap jalan.
      const msg = (err as Error).message;
      if (msg.includes("Failed after") || msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
        return this.promptBuilder.buildTradeContext({
          symbol: ctx.symbol,
          timeframe: ctx.timeframe,
          candles: [],
        });
      }
      throw err;
    }

    return this.promptBuilder.buildTradeContext({
      symbol: ctx.symbol,
      timeframe: ctx.timeframe,
      candles,
    });
  }

  private async buildNewsContext(ctx: NewsContext): Promise<string> {
    const headlines = await this.newsContextPort.getLatestHeadlines(ctx.assets, 15);
    return this.promptBuilder.buildNewsContext(headlines);
  }
}
