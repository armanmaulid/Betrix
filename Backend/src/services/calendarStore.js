import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";

const rawBridgeUrl = process.env.MT5_BRIDGE_URL || "127.0.0.1:8890";
const MT5_HTTP_BASE = process.env.MT5_HTTP_URL || (rawBridgeUrl.startsWith("http") ? rawBridgeUrl : `http://${rawBridgeUrl}`);

// ─────────────────────────────────────────────────────────────────────────
// Economic calendar - sekarang disimpan permanen di Postgres (bukan cuma
// in-memory Map lagi), supaya:
//   1. Histori nggak hilang tiap restart backend.
//   2. Startup nggak perlu re-fetch ±3 bulan dari MT5 tiap kali kalau
//      datanya udah ada (lihat syncCalendarIfNeeded di bawah).
//   3. Data lama otomatis kehapus setelah 1 tahun (lihat cleanupOldCalendarEvents).
// Live delta dari WebSocket (mt5Client.js) tetap jalan terpisah - itu cuma
// nambah/update event yang SUDAH ada di window sekarang+depan, dia nggak
// bisa (dan nggak perlu) mengubah data historis yang lama.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Cek apakah calendar untuk bulan ini + bulan depan sudah ada di DB.
 * Kalau sudah ada -> skip (nggak perlu fetch ulang ke MT5).
 * Kalau belum -> fetch dari GET /v1/calendar (default EA-nya sendiri udah
 * ±1 bulan lalu s/d ±1 bulan depan, lihat mt5-bridge/CommandCore.mqh) dan
 * simpan semuanya ke DB sekaligus (termasuk bulan lalu, sekalian aja).
 */
let lastSeededMonthKey = null;

export async function syncCalendarIfNeeded() {
  try {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;

    // Cek di memori Backend: Apakah bulan ini sudah sukses diverifikasi/sync?
    if (lastSeededMonthKey === currentMonthKey) {
      return; // Langsung return, bypass query DB dan MT5 sepenuhnya!
    }

    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);

    const { rows } = await pool.query(
      "SELECT COUNT(*) FROM calendar_events WHERE event_time >= $1 AND event_time <= $2",
      [startOfThisMonth.toISOString(), endOfNextMonth.toISOString()]
    );
    const existingCount = parseInt(rows[0].count, 10);

    if (existingCount > 0) {
      logger.info(`Calendar bulan ini+depan sudah ada di DB (${existingCount} events). Skip sync ke MT5.`, {
        context: "Calendar",
      });
      lastSeededMonthKey = currentMonthKey; // Simpan status sukses ke memori
      return;
    }

    logger.info("Calendar bulan ini+depan belum ada di DB. Syncing dari MT5...", { context: "Calendar" });

    const res = await fetch(`${MT5_HTTP_BASE}/v1/calendar`); // default EA = ±1 bulan kalender
    if (!res.ok) {
      throw new Error(`MT5 bridge responded with ${res.status}`);
    }
    const data = await res.json();
    const events = Array.isArray(data.events) ? data.events : [];

    const saved = await upsertEvents(events);
    logger.info(`Calendar synced dari MT5: ${saved} events disimpan/diupdate ke DB.`, { context: "Calendar" });
    
    lastSeededMonthKey = currentMonthKey; // Simpan status sukses ke memori
  } catch (err) {
    logger.error(`Gagal sync calendar dari MT5: ${err.message}`, { context: "Calendar" });
    // Sengaja tidak throw - biar server tetap start meski MT5 lagi mati.
    // syncCalendarIfNeeded akan dicoba lagi di kesempatan berikutnya
    // (mis. saat WebSocket ke MT5 berhasil konek).
  }
}

/**
 * Simpan/update sekumpulan calendar event (dari seed REST ATAU dari delta
 * WebSocket - dua-duanya lewat fungsi yang sama). value_id WAJIB ada -
 * event tanpa value_id di-skip (bukan di-collapse pakai event_id, karena
 * event_id BUKAN unik per rilis, event yang sama muncul berkali-kali).
 */
export async function upsertEvents(rawEvents) {
  const valid = rawEvents.filter((ev) => ev.value_id !== undefined && ev.value_id !== null);
  const skipped = rawEvents.length - valid.length;
  if (skipped > 0) {
    logger.warn(`${skipped} calendar event dilewati (tidak ada value_id) - cek versi mt5-bridge.`, {
      context: "Calendar",
    });
  }
  if (valid.length === 0) return 0;

  const chunkSize = 500;
  for (let i = 0; i < valid.length; i += chunkSize) {
    const chunk = valid.slice(i, i + chunkSize);
    const values = [];
    const params = [];
    let idx = 1;

    for (const ev of chunk) {
      values.push(
        `($${idx},$${idx + 1},$${idx + 2},$${idx + 3},$${idx + 4},$${idx + 5},$${idx + 6},$${idx + 7},$${idx + 8},$${idx + 9},now())`
      );
      params.push(
        ev.value_id,
        ev.event_id,
        ev.time,
        ev.country,
        ev.currency,
        ev.name ?? ev.event ?? "",
        ev.importance || "none",
        ev.actual === undefined ? null : ev.actual,
        ev.forecast === undefined ? null : ev.forecast,
        ev.previous === undefined ? null : ev.previous
      );
      idx += 10;
    }

    const query = `
      INSERT INTO calendar_events
        (value_id, event_id, event_time, country, currency, event_name, importance, actual, forecast, previous, updated_at)
      VALUES ${values.join(", ")}
      ON CONFLICT (value_id) DO UPDATE
      SET event_name = EXCLUDED.event_name,
          importance = EXCLUDED.importance,
          actual = EXCLUDED.actual,
          forecast = EXCLUDED.forecast,
          previous = EXCLUDED.previous,
          updated_at = EXCLUDED.updated_at
    `;
    await pool.query(query, params);
  }

  return valid.length;
}

/**
 * Ambil event dari DB dengan filter (dipakai GET /api/market/economic-calendar).
 * countries/currencies/importances kosong/undefined = tidak difilter (semua).
 */
export async function getCalendarEventsFromDb({ fromMs, toMs, countries, currencies, importances }) {
  const conditions = ["event_time >= $1", "event_time <= $2"];
  const params = [new Date(fromMs).toISOString(), new Date(toMs).toISOString()];
  let idx = 3;

  if (countries && countries.length > 0) {
    conditions.push(`country = ANY($${idx})`);
    params.push(countries);
    idx++;
  }
  if (currencies && currencies.length > 0) {
    conditions.push(`currency = ANY($${idx})`);
    params.push(currencies);
    idx++;
  }
  if (importances && importances.length > 0) {
    conditions.push(`importance = ANY($${idx})`);
    params.push(importances);
    idx++;
  }

  const { rows } = await pool.query(
    `SELECT value_id, event_id, event_time, country, currency, event_name, importance, actual, forecast, previous
     FROM calendar_events
     WHERE ${conditions.join(" AND ")}
     ORDER BY event_time ASC`,
    params
  );

  return rows.map((r) => ({
    value_id: String(r.value_id),
    event_id: String(r.event_id),
    time: r.event_time.toISOString(),
    country: r.country,
    currency: r.currency,
    event: r.event_name,
    importance: r.importance,
    actual: r.actual,
    forecast: r.forecast,
    previous: r.previous,
  }));
}

/**
 * Hapus calendar event yang lebih tua dari 1 tahun. Dipanggil sekali pas
 * startup + dijadwalkan ulang tiap 24 jam (lihat server.js).
 */
export async function cleanupOldCalendarEvents() {
  try {
    const { rowCount } = await pool.query("DELETE FROM calendar_events WHERE event_time < now() - interval '1 year'");
    if (rowCount > 0) {
      logger.info(`Calendar cleanup: hapus ${rowCount} event yang lebih dari 1 tahun.`, { context: "Calendar" });
    }
  } catch (err) {
    logger.error(`Gagal cleanup calendar lama: ${err.message}`, { context: "Calendar" });
  }
}
