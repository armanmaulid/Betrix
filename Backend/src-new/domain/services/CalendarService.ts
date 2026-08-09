import { container } from "tsyringe";
import { CalendarRepository } from "@domain/repositories/CalendarRepository.js";
import { CalendarEvent } from "@domain/entities/CalendarEvent.js";
import { Mt5Client } from "@data/external/Mt5Client.js";
import { logger } from "@core/logging/logger.js";

let lastSync: Date | null = null;
const SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export async function syncCalendarIfNeeded(): Promise<void> {
  const now = Date.now();
  if (lastSync && now - lastSync.getTime() < SYNC_INTERVAL) {
    return; // Already synced recently
  }
  
  const calendarRepo = container.resolve(CalendarRepository);
  const mt5Client = container.resolve(Mt5Client);
  
  const maxEventTime = await calendarRepo.getMaxEventTime();
  const fromDate = maxEventTime || new Date();
  
  const events = await mt5Client.fetchCalendar();
  
  if (events.length > 0) {
    await calendarRepo.saveMany(events);
    logger.info(`Synced ${events.length} calendar events`, { context: "Calendar" });
  }
  
  lastSync = new Date();
}

export async function cleanupOldCalendarEvents(): Promise<number> {
  const calendarRepo = container.resolve(CalendarRepository);
  return calendarRepo.cleanupOlderThan(365); // Keep 1 year
}