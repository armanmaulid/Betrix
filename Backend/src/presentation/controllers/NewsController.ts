import type { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import { GetNewsUseCase } from "@application/use-cases/news/GetNewsUseCase.js";
import { INotifier } from "@application/ports/INotifier.js";
import type { AuthenticatedRequest } from "@presentation/middleware/auth.middleware.js";

const VALID_ASSETS = ["usd", "eur", "gbp", "jpy", "metal", "oil", "btc", "eco", "global", "crypto"];

export class NewsController {
  private getGetNewsUseCase() {
    return container.resolve(GetNewsUseCase);
  }

  private getSseNotifier(): INotifier {
    return container.resolve<INotifier>("INotifier");
  }

  async stream(req: Request, res: Response, next: NextFunction) {
    try {
      const userReq = req as AuthenticatedRequest;
      const { userId, token } = userReq.user;

      this.getSseNotifier().addClient(userId, token, res);
      // Keep connection alive, handled by addClient which writes headers and manages cleanup.
    } catch (err) {
      next(err);
    }
  }

  async getNews(req: Request, res: Response, next: NextFunction) {
    try {
      const { asset } = req.query;
      const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      if (asset && !VALID_ASSETS.includes(asset as string)) {
        return res.status(400).json({
          error: `asset tidak dikenal, pilih salah satu: ${VALID_ASSETS.join(", ")}`,
          code: "VALIDATION_ERROR"
        });
      }

      const articles = await this.getGetNewsUseCase().execute({
        limit,
        offset,
        asset: asset as string | undefined
      });

      res.json({
        news: articles.map(r => ({
          id: r.id,
          source: r.source,
          title: r.title,
          url: r.url,
          summary: r.summary,
          assetTags: r.assetTags,
          publishedAt: r.publishedAt
        }))
      });
    } catch (err) {
      next(err);
    }
  }
}
