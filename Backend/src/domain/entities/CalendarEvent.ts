export enum CalendarImportance {
  NONE = "none",
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

export class CalendarEvent {
  constructor(
    public readonly valueId: number,
    public readonly eventId: number,
    public readonly eventTime: Date,
    public readonly country: string,
    public readonly currency: string,
    public readonly eventName: string,
    public readonly importance: CalendarImportance,
    public readonly actual: string | null,
    public readonly forecast: string | null,
    public readonly previous: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  static create(data: {
    valueId: number;
    eventId: number;
    eventTime: Date;
    country: string;
    currency: string;
    eventName: string;
    importance?: CalendarImportance;
    actual?: string | null;
    forecast?: string | null;
    previous?: string | null;
  }): CalendarEvent {
    const now = new Date();
    return new CalendarEvent(
      data.valueId,
      data.eventId,
      data.eventTime,
      data.country,
      data.currency,
      data.eventName,
      data.importance ?? CalendarImportance.NONE,
      data.actual ?? null,
      data.forecast ?? null,
      data.previous ?? null,
      now,
      now
    );
  }

  withUpdatedValues(
    actual: string | null,
    forecast: string | null,
    previous: string | null
  ): CalendarEvent {
    return new CalendarEvent(
      this.valueId,
      this.eventId,
      this.eventTime,
      this.country,
      this.currency,
      this.eventName,
      this.importance,
      actual,
      forecast,
      previous,
      this.createdAt,
      new Date()
    );
  }
}