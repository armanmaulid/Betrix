import "dotenv/config";
import { pgClient } from "./src/data/orm/pgClient.js";
async function runCleanup() {
  console.log("Connecting to database...");
  const client = await pgClient.connect();
  try {
    const result = await client.query(`
      UPDATE message_notification_preferences
      SET email_enabled = true
      WHERE email_enabled IS NULL;
    `);
    console.log(`Cleanup complete. Rows updated: ${result.rowCount}`);
  } catch (err) {
    console.error("Error during cleanup:", err);
  } finally {
    client.release();
    process.exit(0);
  }
}

runCleanup();
