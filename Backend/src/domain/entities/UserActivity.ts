export class UserActivity {
  constructor(
    public readonly id: number,
    public readonly userId: string,
    public readonly action: string,
    public readonly details: any,
    public readonly ip: string | null,
    public readonly userAgent: string | null,
    public readonly createdAt: Date
  ) {}
}
