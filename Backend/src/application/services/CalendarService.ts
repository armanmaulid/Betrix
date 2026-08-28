import { inject, injectable } from "tsyringe";
import { IBrokerProvider, CalendarUpdate, Mt5CalendarEvent } from "@domain/ports/IBrokerProvider.js";
import { CalendarRepository, CalendarQuery } from "@domain/repositories/CalendarRepository.js";
import { CalendarEvent, CalendarImportance } from "@domain/entities/CalendarEvent.js";
import { logger } from "@core/logging/logger.js";
import type { AppSettings } from "@core/settings/AppSettings.js";
import { INotifier } from "@domain/ports/INotifier.js";

@injectable()
export class CalendarService {
  constructor(
    @inject("CalendarRepository") private calendarRepo: CalendarRepository,
    @inject("IBrokerProvider") private brokerClient: IBrokerProvider,
    @inject("INotifier") private notifier: INotifier,
    @inject("AppSettings") private settings: AppSettings
  ) {}

  async syncIfNeeded(): Promise<void> {
    const maxDate = await this.calendarRepo.getMaxEventTime();

    if (!maxDate) {
      // Database is completely empty, perform initial bootstrap
      logger.info("Calendar database is empty. Bootstrapping with last, this, and next month.", { context: "Calendar" });
      await this.fetchAndSavePeriod("last_month");
      await this.fetchAndSavePeriod("this_month");
      await this.fetchAndSavePeriod("next_month");
      return;
    }

    const now = new Date();
    // Create a date representing the start of the next month
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // If our max event date is older than the start of next month,
    // it means we haven't synced the new month's data yet.
    if (maxDate < startOfNextMonth) {
      logger.info("New month detected or missing future events. Syncing this month and next month.", { context: "Calendar" });
      await this.fetchAndSavePeriod("this_month");
      await this.fetchAndSavePeriod("next_month");
    } else {
      logger.info(`Calendar data is up-to-date. (Latest event found: ${maxDate.toISOString()}). Skipping fetch.`, { context: "Calendar" });
    }
  }

  private async fetchAndSavePeriod(period: string): Promise<void> {
    try {
      const rawEvents = await this.brokerClient.fetchCalendar(period);
      if (rawEvents && rawEvents.length > 0) {
        const events = rawEvents.map(e => this.transformMt5Event(e));
        await this.calendarRepo.saveMany(events);
        logger.info(`Synced ${events.length} calendar events for period '${period}'`, { context: "Calendar" });
      }
    } catch (err) {
      logger.error(`Failed to fetch calendar for period '${period}': ${(err as Error).message}`, { context: "Calendar" });
    }
  }

  private transformMt5Event(e: Mt5CalendarEvent): CalendarEvent {
    // Use actual value_id if available, fallback to event_id
    const valueId = e.value_id ?? e.event_id;
    const importanceMap: CalendarImportance[] = [CalendarImportance.NONE, CalendarImportance.LOW, CalendarImportance.MEDIUM, CalendarImportance.HIGH];
    const importance = importanceMap[e.importance] || CalendarImportance.NONE;

    const sign = this.settings.brokerUtcOffset >= 0 ? "+" : "-";
    const hours = Math.abs(this.settings.brokerUtcOffset).toString().padStart(2, "0");
    const timezoneStr = `${sign}${hours}:00`;

    return CalendarEvent.create({
      valueId,
      eventId: e.event_id,
      eventTime: new Date(`${e.time}${timezoneStr}`),
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

  async handleLiveUpdate(update: CalendarUpdate): Promise<void> {
    try {
      const existingEvent = await this.calendarRepo.findByValueId(update.value_id);
      if (!existingEvent) {
        const evTime = update.time ?? "n/a";
        const evName = update.name ?? "Unknown";
        const evCcy = update.currency ?? "";
        logger.debug(`Calendar Live Update [Value ${update.value_id}] ${evCcy} - ${evName} @ ${evTime} - Actual: ${update.actual} | Forecast: ${update.forecast} | Prev: ${update.previous}`, { context: "Broker" });
        return;
      }

      logger.debug(`Calendar Live Update [Value ${update.value_id}] ${existingEvent.currency} - ${existingEvent.eventName} @ ${existingEvent.eventTime.toISOString()} - Actual: ${update.actual} | Forecast: ${update.forecast} | Prev: ${update.previous}`, { context: "Broker" });


      // COALESCE di repo (ON CONFLICT) yang pegang kebenaran terakhir.
      // Broadcast hasil RETURNING * — bukan entity stale hasil withUpdatedValues
      // — supaya update paralel (EA burst banyak event sekaligus) tidak
      // meng-overwrite actual non-null jadi null di SSE.
      const updatedEvent = existingEvent.withUpdatedValues(
        update.actual !== undefined ? update.actual : existingEvent.actual,
        update.forecast !== undefined ? update.forecast : existingEvent.forecast,
        update.previous !== undefined ? update.previous : existingEvent.previous
      );

      const savedEvent = await this.calendarRepo.save(updatedEvent);

      if (this.settings.trackCalendar) {
        this.notifier.broadcastGlobal("calendar_update", savedEvent);
      }
    } catch (err) {
      logger.error(`Failed to handle live calendar update: ${(err as Error).message}`, { context: "Calendar" });
    }
  }
}