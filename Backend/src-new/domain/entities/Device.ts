export class Device {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly fingerprint: string,
    public readonly createdAt: Date,
    public readonly lastSeenAt: Date
  ) {}

  static create(data: {
    userId: string;
    fingerprint: string;
  }): Device {
    const now = new Date();
    return new Device(
      crypto.randomUUID(),
      data.userId,
      data.fingerprint,
      now,
      now
    );
  }

  updateLastSeen(): Device {
    return new Device(
      this.id,
      this.userId,
      this.fingerprint,
      this.createdAt,
      new Date()
    );
  }
}