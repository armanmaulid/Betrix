import { pool } from "../db/pool.js";
import { broadcastToUser } from "./sseManager.js";

// Atomically deducts credits and logs the transaction. 
// Returns the new balance, or throws an error if insufficient funds.
export async function deductCredits(userId, amount, action) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    const { rows } = await client.query(
      `UPDATE users 
       SET credits = credits - $1 
       WHERE id = $2 AND credits >= $1 
       RETURNING credits`,
      [amount, userId]
    );

    if (rows.length === 0) {
      throw new Error("Insufficient credits");
    }

    await client.query(
      `INSERT INTO credit_transactions (user_id, amount, action) VALUES ($1, $2, $3)`,
      [userId, -amount, action]
    );

    await client.query("COMMIT");
    
    const newBalance = rows[0].credits;
    broadcastToUser(userId, "credits_update", { credits: newBalance });
    
    return newBalance;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function addCredits(userId, amount, action) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    const { rows } = await client.query(
      `UPDATE users 
       SET credits = credits + $1 
       WHERE id = $2
       RETURNING credits`,
      [amount, userId]
    );

    await client.query(
      `INSERT INTO credit_transactions (user_id, amount, action) VALUES ($1, $2, $3)`,
      [userId, amount, action]
    );

    await client.query("COMMIT");

    const newBalance = rows[0].credits;
    broadcastToUser(userId, "credits_update", { credits: newBalance });

    return newBalance;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
