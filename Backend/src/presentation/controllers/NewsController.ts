import type { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { GetNewsUseCase } from "@modules/news/application/use-cases/GetNewsUseCase.js";
import { INotifier } from "@domain/ports/INotifier.js";
import type { AuthenticatedRequest } from "@presentation/middleware/auth.middleware.js";
import { NEWS_ASSETS } from "@core/constants/index.js";

@injectable()
export class NewsController {
  constructor(
    @inject("GetNewsUseCase") private getNewsUseCase: GetNewsUseCase,
    @inject("INotifier") private sseNotifier: INotifier
  ) {}

  async stream(req: Request, res: Response, next: NextFunction) {
    try {
      const userReq = req as AuthenticatedRequest;
      const { userId, token } = userReq.user;

      this.sseNotifier.addClient(userId, token, res);
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

      if (asset && !(NEWS_ASSETS as readonly string[]).includes(asset as string)) {
        return res.status(400).json({
          error: `Asset not recognized, pick one of: ${NEWS_ASSETS.join(", ")}`,
          code: "VALIDATION_ERROR"
        });
      }

      const articles = await this.getNewsUseCase.execute({
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
