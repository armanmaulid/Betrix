import { injectable } from "tsyringe";
import { pgClient } from "../orm/pgClient.js";
import { CalendarRepository, CalendarQuery } from "@domain/repositories/CalendarRepository.js";
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
    
    // Deduplicate events by valueId to prevent Postgres "ON CONFLICT cannot affect row a second time" error
    // If there are duplicates in the payload, the last one wins.
    const uniqueEventsMap = new Map<number, CalendarEvent>();
    for (const event of events) {
      uniqueEventsMap.set(event.valueId, event);
    }
    const uniqueEvents = Array.from(uniqueEventsMap.values());
    
    const client = await pgClient.connect();
    const onError = (err: Error) => console.error("Client error in saveMany:", err.message);
    client.on("error", onError);

    try {
      await client.query("BEGIN");
      let count = 0;
      
      // Batch into chunks of 100 to speed up insertion with a single bulk query per chunk
      const chunkSize = 100;
      for (let i = 0; i < uniqueEvents.length; i += chunkSize) {
        const chunk = uniqueEvents.slice(i, i + chunkSize);
        
        const placeholders: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;
        
        for (const event of chunk) {
          placeholders.push(`($${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++},$${paramIndex++})`);
          params.push(
            event.valueId, event.eventId, event.eventTime, event.country,
            event.currency, event.eventName, event.importance,
            event.actual, event.forecast, event.previous,
            event.createdAt, event.updatedAt
          );
        }
        
        const queryStr = `
          INSERT INTO calendar_events (value_id, event_id, event_time, country, currency, event_name, importance, actual, forecast, previous, created_at, updated_at)
          VALUES ${placeholders.join(",")}
          ON CONFLICT (value_id) DO UPDATE SET
            actual = EXCLUDED.actual,
            forecast = EXCLUDED.forecast,
            previous = EXCLUDED.previous,
            updated_at = EXCLUDED.updated_at
        `;
        
        const result = await client.query(queryStr, params);
        count += result.rowCount || 0;
      }
      
      await client.query("COMMIT");
      return count;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.removeListener("error", onError);
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

  async findByQuery(query: CalendarQuery): Promise<CalendarEvent[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (query.startDate) {
      conditions.push(`event_time >= $${paramIndex}`);
      params.push(query.startDate);
      paramIndex++;
    }

    if (query.endDate) {
      conditions.push(`event_time < $${paramIndex}`);
      params.push(query.endDate);
      paramIndex++;
    }

    if (query.country) {
      conditions.push(`country = $${paramIndex}`);
      params.push(query.country);
      paramIndex++;
    }

    if (query.currency) {
      conditions.push(`currency = $${paramIndex}`);
      params.push(query.currency);
      paramIndex++;
    }

    if (query.importance) {
      conditions.push(`importance = $${paramIndex}`);
      params.push(query.importance);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    
    let queryStr = `
      SELECT * FROM calendar_events 
      ${whereClause}
      ORDER BY event_time ASC
    `;
    
    if (query.limit) {
      queryStr += ` LIMIT $${paramIndex}`;
      params.push(query.limit);
    }

    const { rows } = await pgClient.query(queryStr, params);
    return rows.map(this.mapRow);
  }

  async findByEventId(eventId: number): Promise<CalendarEvent | null> {
    const { rows } = await pgClient.query(
      `SELECT * FROM calendar_events WHERE event_id = $1 LIMIT 1`,
      [eventId]
    );
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async findByValueId(valueId: number): Promise<CalendarEvent | null> {
    const { rows } = await pgClient.query(
      `SELECT * FROM calendar_events WHERE value_id = $1 LIMIT 1`,
      [valueId]
    );
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
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