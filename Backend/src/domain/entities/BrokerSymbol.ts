export class BrokerSymbol {
  constructor(
    public readonly symbol: string,
    public readonly description: string | null,
    public readonly path: string | null,
    public readonly category: string | null,
    public readonly isActive: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  static create(data: {
    symbol: string;
    description?: string | null;
    path?: string | null;
    category?: string | null;
    isActive?: boolean;
  }): BrokerSymbol {
    const now = new Date();
    return new BrokerSymbol(
      data.symbol,
      data.description ?? null,
      data.path ?? null,
      data.category ?? null,
      data.isActive ?? true,
      now,
      now
    );
  }
}