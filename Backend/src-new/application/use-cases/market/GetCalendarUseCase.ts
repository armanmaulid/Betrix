import { inject, injectable } from "tsyringe";
import { CalendarRepository } from "@domain/repositories/CalendarRepository.js";
import { CalendarEvent, CalendarImportance } from "@domain/entities/CalendarEvent.js";

interface GetCalendarInput {
  startDate?: Date;
  endDate?: Date;
  country?: string;
  currency?: string;
  importance?: CalendarImportance;
  limit: number;
}

interface GetCalendarOutput {
  events: CalendarEvent[];
}

@injectable()
export class GetCalendarUseCase {
  constructor(
    @inject("CalendarRepository") private calendarRepo: CalendarRepository
  ) {}

  async execute(input: GetCalendarInput): Promise<GetCalendarOutput> {
    let events: CalendarEvent[];

    if (input.startDate && input.endDate) {
      events = await this.calendarRepo.findByTimeRange(input.startDate, input.endDate);
    } else if (input.country) {
      events = await this.calendarRepo.findByCountry(input.country, input.limit);
    } else if (input.currency) {
      events = await this.calendarRepo.findByCurrency(input.currency, input.limit);
    } else if (input.importance) {
      events = await this.calendarRepo.findByImportance(input.importance, input.limit);
    } else {
      events = await this.calendarRepo.findLatest(input.limit);
    }

    return { events };
  }
}