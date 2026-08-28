import { inject, injectable } from "tsyringe";
import { NewsRepository } from "@modules/news/domain/NewsRepository.js";
import { NewsArticle } from "@modules/news/domain/NewsArticle.js";

@injectable()
export class GetNewsUseCase {
  constructor(
    @inject("NewsRepository") private newsRepo: NewsRepository
  ) {}

  async execute(params: { limit: number; offset: number; asset?: string }): Promise<NewsArticle[]> {
    if (params.asset) {
      return this.newsRepo.findByAssetTags([params.asset], params.limit, params.offset);
    }
    return this.newsRepo.findLatest(params.limit, params.offset);
  }
}
