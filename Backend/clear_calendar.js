import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to database...");
    await client.query('TRUNCATE TABLE calendar_events;');
    console.log("Successfully truncated calendar_events table!");
  } catch (err) {
    console.error("Error truncating table:", err);
  } finally {
    await client.end();
  }
}

run();
