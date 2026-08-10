import { inject, injectable } from "tsyringe";
import { CalendarRepository } from "@domain/repositories/CalendarRepository.js";
import { CalendarEvent } from "@domain/entities/CalendarEvent.js";
import { Mt5Client } from "@data/external/Mt5Client.js";
import { logger } from "@core/logging/logger.js";

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

    const maxEventTime = await this.calendarRepo.getMaxEventTime();
    const fromDate = maxEventTime || new Date();

    const events = await this.mt5Client.fetchCalendar();

    if (events.length > 0) {
      await this.calendarRepo.saveMany(events);
      logger.info(`Synced ${events.length} calendar events`, { context: "Calendar" });
    }

    this.lastSync = new Date();
  }

  async cleanupOldEvents(): Promise<number> {
    return this.calendarRepo.cleanupOlderThan(365); // Keep 1 year
  }
}