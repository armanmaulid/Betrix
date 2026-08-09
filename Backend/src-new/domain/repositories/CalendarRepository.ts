import { CalendarEvent, CalendarImportance } from "../entities/CalendarEvent.js";

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
}