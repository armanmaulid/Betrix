/**
 * Simulasi race condition calendar actual yang bikin blink.
 *
 * Skenario: EA burst 2 update untuk event yang sama hampir bersamaan:
 *   - update A: actual = "2.5"  (event baru rilis)
 *   - update B: actual = null   (field absent / revisi kosong)
 *
 * Sebelum fix: update B clobber DB jadi null → SSE broadcast null →
 * frontend tampil "-" (hilang) lalu muncul lagi (blink).
 *
 * Setelah fix (COALESCE): null tidak clobber non-null. DB akhir "2.5".
 *
 * Jalankan: npx tsx test/calendar-race.test.ts
 */
import { pgClient } from "../src/data/orm/pgClient.js";

const TEST_VALUE_ID = 999999999;
const TEST_EVENT_ID = 999999999;

async function seed() {
  await pgClient.query(
    `INSERT INTO calendar_events
       (value_id, event_id, event_time, country, currency, event_name, importance, actual, forecast, previous, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (value_id) DO UPDATE SET actual = EXCLUDED.actual`,
    [
      TEST_VALUE_ID, TEST_EVENT_ID,
      new Date(Date.now() + 3600_000), // 1 jam ke depan
      "US", "USD", "TEST RACE EVENT", "high",
      null, "2.0", "1.8",            // actual=null, forecast, previous
      new Date(), new Date(),
    ]
  );
}

async function getActual(): Promise<string | null> {
  const { rows } = await pgClient.query(
    `SELECT actual FROM calendar_events WHERE value_id = $1`,
    [TEST_VALUE_ID]
  );
  return rows[0]?.actual ?? null;
}

async function save(actual: string | null): Promise<string | null> {
  // Replika PgCalendarRepository.save (post-fix: COALESCE)
  const { rows } = await pgClient.query(
    `INSERT INTO calendar_events (value_id, event_id, event_time, country, currency, event_name, importance, actual, forecast, previous, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (value_id) DO UPDATE SET
       actual = COALESCE(EXCLUDED.actual, calendar_events.actual),
       forecast = COALESCE(EXCLUDED.forecast, calendar_events.forecast),
       previous = COALESCE(EXCLUDED.previous, calendar_events.previous),
       updated_at = EXCLUDED.updated_at
     RETURNING actual`,
    [
      TEST_VALUE_ID, TEST_EVENT_ID,
      new Date(Date.now() + 3600_000),
      "US", "USD", "TEST RACE EVENT", "high",
      actual, "2.0", "1.8",
      new Date(), new Date(),
    ]
  );
  return rows[0]?.actual ?? null;
}

async function cleanup() {
  await pgClient.query(`DELETE FROM calendar_events WHERE value_id = $1`, [TEST_VALUE_ID]);
}

async function main() {
  console.log("=== Calendar Race Test ===\n");

  await cleanup();
  await seed();
  console.log("Seed: actual =", await getActual(), "(expect null)\n");

  // Simulasi burst paralel: update A (actual="2.5") + update B (actual=null)
  // tanpa await berurutan — mirip Mt5WebsocketClient.handleCalendarUpdate loop.
  const [resA, resB] = await Promise.all([
    save("2.5"),  // event rilis actual
    save(null),   // field absent → null
  ]);

  console.log("Update A (actual=2.5) → broadcast:", resA);
  console.log("Update B (actual=null) → broadcast:", resB);

  const final = await getActual();
  console.log("\nDB final actual:", final);

  if (final === "2.5") {
    console.log("PASS: null tidak clobber non-null. Blink terfix.");
  } else {
    console.log("FAIL: actual =", final, "(expect 2.5) — race masih ada.");
  }

  await cleanup();
  await pgClient.end();
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
