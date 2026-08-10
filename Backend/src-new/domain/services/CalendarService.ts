import { inject, injectable } from "tsyringe";
import { CalendarRepository } from "@domain/repositories/CalendarRepository.js";
import { CalendarEvent, CalendarImportance } from "@domain/entities/CalendarEvent.js";
import { Mt5Client } from "@data/external/Mt5Client.js";
import { logger } from "@core/logging/logger.js";
import { CalendarQuery } from "@domain/repositories/CalendarRepository.js";

interface Mt5CalendarEvent {
  event_id: number;
  name: string;
  country_code: string;
  currency: string;
  importance: number;
  time: string;
  actual?: number;
  forecast?: number;
  previous?: number;
}

@injectable()
export class CalendarService {
  private lastSync: Date | null = null;
  private readonly SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    @inject("CalendarRepository") private calendarRepo: CalendarRepository,
    @inject("Mt5Client") private mt5Client: Mt5Client
  ) {}

  async syncIfNeeded(): Promise<void> {
    const now = Date.now();
    if (this.lastSync && now - this.lastSync.getTime() < this.SYNC_INTERVAL) {
      return; // Already synced recently
    }

    const rawEvents = await this.mt5Client.fetchCalendar("today");

    if (rawEvents.length > 0) {
      const events = rawEvents.map(e => this.transformMt5Event(e));
      await this.calendarRepo.saveMany(events);
      logger.info(`Synced ${events.length} calendar events`, { context: "Calendar" });
    }

    this.lastSync = new Date();
  }

  private transformMt5Event(e: Mt5CalendarEvent): CalendarEvent {
    // Use event_id as value_id (unique per event)
    const valueId = e.event_id;
    const importanceMap: CalendarImportance[] = [CalendarImportance.NONE, CalendarImportance.LOW, CalendarImportance.MEDIUM, CalendarImportance.HIGH];
    const importance = importanceMap[e.importance] || CalendarImportance.NONE;

    return CalendarEvent.create({
      valueId,
      eventId: e.event_id,
      eventTime: new Date(e.time),
      country: e.country_code,
      currency: e.currency,
      eventName: e.name,
      importance,
      actual: e.actual?.toString() ?? null,
      forecast: e.forecast?.toString() ?? null,
      previous: e.previous?.toString() ?? null,
    });
  }

  async getCalendar(query: CalendarQuery): Promise<CalendarEvent[]> {
    return this.calendarRepo.findByQuery(query);
  }

  async cleanupOldEvents(): Promise<number> {
    return this.calendarRepo.cleanupOlderThan(365); // Keep 1 year
  }
}