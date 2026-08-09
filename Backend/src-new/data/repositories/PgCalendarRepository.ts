import { injectable } from "tsyringe";
import { pgClient } from "../orm/pgClient.js";
import { CalendarRepository } from "@domain/repositories/CalendarRepository.js";
import { CalendarEvent, CalendarImportance } from "@domain/entities/CalendarEvent.js";

@injectable()
export class PgCalendarRepository implements CalendarRepository {
  async save(event: CalendarEvent): Promise<CalendarEvent> {
    const { rows } = await pgClient.query(
      `INSERT INTO calendar_events (value_id, event_id, event_time, country, currency, event_name, importance, actual, forecast, previous, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (value_id) DO UPDATE SET
         actual = EXCLUDED.actual,
         forecast = EXCLUDED.forecast,
         previous = EXCLUDED.previous,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [
        event.valueId, event.eventId, event.eventTime, event.country,
        event.currency, event.eventName, event.importance,
        event.actual, event.forecast, event.previous,
        event.createdAt, event.updatedAt
      ]
    );
    return this.mapRow(rows[0]);
  }

  async saveMany(events: CalendarEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    
    const client = await pgClient.connect();
    try {
      await client.query("BEGIN");
      let count = 0;
      for (const event of events) {
        const { rowCount } = await client.query(
          `INSERT INTO calendar_events (value_id, event_id, event_time, country, currency, event_name, importance, actual, forecast, previous, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (value_id) DO UPDATE SET
             actual = EXCLUDED.actual,
             forecast = EXCLUDED.forecast,
             previous = EXCLUDED.previous,
             updated_at = EXCLUDED.updated_at`,
          [
            event.valueId, event.eventId, event.eventTime, event.country,
            event.currency, event.eventName, event.importance,
            event.actual, event.forecast, event.previous,
            event.createdAt, event.updatedAt
          ]
        );
        count += rowCount || 0;
      }
      await client.query("COMMIT");
      return count;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async findByTimeRange(start: Date, end: Date): Promise<CalendarEvent[]> {
    const { rows } = await pgClient.query(
      `SELECT * FROM calendar_events WHERE event_time >= $1 AND event_time < $2 ORDER BY event_time`,
      [start, end]
    );
    return rows.map(this.mapRow);
  }

  async findByCountry(country: string, limit: number): Promise<CalendarEvent[]> {
    const { rows } = await pgClient.query(
      `SELECT * FROM calendar_events WHERE country = $1 ORDER BY event_time DESC LIMIT $2`,
      [country, limit]
    );
    return rows.map(this.mapRow);
  }

  async findByCurrency(currency: string, limit: number): Promise<CalendarEvent[]> {
    const { rows } = await pgClient.query(
      `SELECT * FROM calendar_events WHERE currency = $1 ORDER BY event_time DESC LIMIT $2`,
      [currency, limit]
    );
    return rows.map(this.mapRow);
  }

  async findByImportance(importance: CalendarImportance, limit: number): Promise<CalendarEvent[]> {
    const { rows } = await pgClient.query(
      `SELECT * FROM calendar_events WHERE importance = $1 ORDER BY event_time DESC LIMIT $2`,
      [importance, limit]
    );
    return rows.map(this.mapRow);
  }

  async findLatest(limit: number): Promise<CalendarEvent[]> {
    const { rows } = await pgClient.query(
      `SELECT * FROM calendar_events ORDER BY event_time DESC LIMIT $1`,
      [limit]
    );
    return rows.map(this.mapRow);
  }

  async cleanupOlderThan(days: number): Promise<number> {
    const { rowCount } = await pgClient.query(
      `DELETE FROM calendar_events WHERE event_time < NOW() - INTERVAL '1 day' * $1`,
      [days]
    );
    return rowCount || 0;
  }

  async getMaxEventTime(): Promise<Date | null> {
    const { rows } = await pgClient.query(
      `SELECT MAX(event_time) as max_time FROM calendar_events`
    );
    return rows[0]?.max_time || null;
  }

  private mapRow(row: any): CalendarEvent {
    return new CalendarEvent(
      row.value_id, row.event_id, row.event_time, row.country,
      row.currency, row.event_name, row.importance as CalendarImportance,
      row.actual, row.forecast, row.previous,
      row.created_at, row.updated_at
    );
  }
}