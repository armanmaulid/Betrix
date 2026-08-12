import type { CalendarEvent, CalendarImportance } from "../entities/CalendarEvent.js";

export interface CalendarQuery {
  startDate?: Date;
  endDate?: Date;
  country?: string;
  currency?: string;
  importance?: CalendarImportance;
  limit?: number;
}

export interface CalendarRepository {
  save(event: CalendarEvent): Promise<CalendarEvent>;
  saveMany(events: CalendarEvent[]): Promise<number>;
  findByTimeRange(start: Date, end: Date): Promise<CalendarEvent[]>;
  findByCountry(country: string, limit: number): Promise<CalendarEvent[]>;
  findByCurrency(currency: string, limit: number): Promise<CalendarEvent[]>;
  findByImportance(importance: CalendarImportance, limit: number): Promise<CalendarEvent[]>;
  findLatest(limit: number): Promise<CalendarEvent[]>;
  cleanupOlderThan(days: number): Promise<number>;
  getMaxEventTime(): Promise<Date | null>;
  findByQuery(query: CalendarQuery): Promise<CalendarEvent[]>;
  findByEventId(eventId: number): Promise<CalendarEvent | null>;
}