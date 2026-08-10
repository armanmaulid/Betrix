export class NewsArticle {
  constructor(
    public readonly id: string,
    public readonly source: string,
    public readonly title: string,
    public readonly url: string,
    public readonly summary: string | null,
    public readonly assetTags: string[],
    public readonly publishedAt: Date | null,
    public readonly createdAt: Date
  ) {}

  static create(data: {
    source: string;
    title: string;
    url: string;
    summary?: string | null;
    assetTags?: string[];
    publishedAt?: Date | null;
  }): NewsArticle {
    return new NewsArticle(
      crypto.randomUUID(),
      data.source,
      data.title,
      data.url,
      data.summary ?? null,
      data.assetTags ?? [],
      data.publishedAt ?? null,
      new Date()
    );
  }
}