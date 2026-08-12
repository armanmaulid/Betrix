export class Session {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly token: string,
    public readonly createdAt: Date,
    public readonly expiresAt: Date,
    public readonly deviceFingerprint: string | null,
    public readonly ip: string | null,
    public readonly userAgent: string | null
  ) {}

  static create(data: {
    userId: string;
    token: string;
    deviceFingerprint?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    ttlSeconds?: number;
  }): Session {
    const now = new Date();
    const ttl = data.ttlSeconds || 24 * 60 * 60;
    return new Session(
      crypto.randomUUID(),
      data.userId,
      data.token,
      now,
      new Date(now.getTime() + ttl * 1000),
      data.deviceFingerprint ?? null,
      data.ip ?? null,
      data.userAgent ?? null
    );
  }

  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }
}