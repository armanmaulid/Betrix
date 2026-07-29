import { pool } from "./src/db/pool.js";

async function test() {
  try {
    const res = await pool.query("SELECT * FROM chat_logs");
    console.log("Chat Logs count:", res.rows.length);
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
test();
