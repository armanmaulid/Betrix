import { injectable } from "tsyringe";
import { pgClient } from "../orm/pgClient.js";
import { MessageRepository } from "@domain/repositories/MessageRepository.js";
import { Message } from "@domain/entities/Message.js";

@injectable()
export class PgMessageRepository implements MessageRepository {
  async save(message: Message): Promise<Message> {
    const client = await pgClient.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO messages (id, from_user_id, to_user_id, subject, body, thread_id, reply_to_message_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          message.id, message.fromUserId, message.toUserId,
          message.subject, message.body, message.threadId,
          message.replyToMessageId, message.createdAt
        ]
      );
      let saved = this.mapRow(rows[0]);
      
      if (!message.threadId) {
        await client.query(
          `UPDATE messages SET thread_id = id WHERE id = $1`,
          [saved.id]
        );
        saved = new Message(
          saved.id, saved.fromUserId, saved.toUserId,
          saved.subject, saved.body, saved.readAt,
          saved.id, saved.replyToMessageId, saved.deletedAt, saved.createdAt
        );
      }
      
      await client.query("COMMIT");
      return saved;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async saveMany(messages: Message[]): Promise<void> {
    if (messages.length === 0) return;
    
    const values = messages.map((m, i) =>
      `($${i * 8 + 1}, $${i * 8 + 2}, $${i * 8 + 3}, $${i * 8 + 4}, $${i * 8 + 5}, $${i * 8 + 6}, $${i * 8 + 7}, $${i * 8 + 8})`
    ).join(", ");
    
    const params: unknown[] = [];
    for (const m of messages) {
      params.push(m.id, m.fromUserId, m.toUserId, m.subject, m.body, m.threadId, m.replyToMessageId, m.createdAt);
    }
    
    await pgClient.query(
      `INSERT INTO messages (id, from_user_id, to_user_id, subject, body, thread_id, reply_to_message_id, created_at)
       VALUES ${values}`,
      params
    );
  }

  async findInbox(userId: string, params: {
    limit: number;
    offset: number;
    unread?: boolean;
    search?: string;
  }): Promise<{ messages: Message[]; total: number; unreadCount: number }> {
    const conditions = ["m.to_user_id = $1 AND m.deleted_at IS NULL"];
    const values: unknown[] = [userId];
    let paramIndex = 2;

    if (params.unread) {
      conditions.push("m.read_at IS NULL");
    }

    if (params.search) {
      conditions.push(`(m.subject ILIKE $${paramIndex} OR m.body ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
      values.push(`%${params.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");
    
    let joinClause = "";
    if (params.search) {
      joinClause = "LEFT JOIN users u ON m.from_user_id = u.id";
    }

    const countQuery = `SELECT COUNT(*) as total FROM messages m ${joinClause} WHERE ${whereClause}`;
    const { rows: countRows } = await pgClient.query(countQuery, values);
    const total = parseInt(countRows[0].total);

    const { rows: unreadRows } = await pgClient.query(
      `SELECT COUNT(*) as unread FROM messages WHERE to_user_id = $1 AND read_at IS NULL AND deleted_at IS NULL`,
      [userId]
    );
    const unreadCount = parseInt(unreadRows[0].unread);

    values.push(params.limit, params.offset);
    const query = `
      SELECT
        m.*, u.id as from_user_id, u.email as from_email, u.name as from_name
      FROM messages m
      ${joinClause}
      WHERE ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const { rows } = await pgClient.query(query, values);
    return { messages: rows.map(this.mapRow), total, unreadCount };
  }

  async findSent(userId: string, params: {
    limit: number;
    offset: number;
    search?: string;
  }): Promise<{ messages: Message[]; total: number }> {
    const conditions = ["m.from_user_id = $1 AND m.deleted_at IS NULL"];
    const values: unknown[] = [userId];
    let paramIndex = 2;

    if (params.search) {
      conditions.push(`(m.subject ILIKE $${paramIndex} OR m.body ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
      values.push(`%${params.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");
    let joinClause = "";
    if (params.search) {
      joinClause = "LEFT JOIN users u ON m.to_user_id = u.id";
    }

    const countQuery = `SELECT COUNT(*) as total FROM messages m ${joinClause} WHERE ${whereClause}`;
    const { rows: countRows } = await pgClient.query(countQuery, values);
    const total = parseInt(countRows[0].total);

    values.push(params.limit, params.offset);
    const query = `
      SELECT
        m.*, u.id as to_user_id, u.email as to_email, u.name as to_name
      FROM messages m
      ${joinClause}
      WHERE ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const { rows } = await pgClient.query(query, values);
    return { messages: rows.map(this.mapRow), total };
  }

  async findById(id: string, userId: string): Promise<Message | null> {
    const { rows } = await pgClient.query(
      `SELECT
        m.*,
        uf.id as from_user_id, uf.email as from_email, uf.name as from_name,
        ut.id as to_user_id, ut.email as to_email, ut.name as to_name
      FROM messages m
      LEFT JOIN users uf ON m.from_user_id = uf.id
      LEFT JOIN users ut ON m.to_user_id = ut.id
      WHERE m.id = $1 AND (m.from_user_id = $2 OR m.to_user_id = $2)`,
      [id, userId]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async findThread(threadId: string, userId: string): Promise<Message[]> {
    const { rows } = await pgClient.query(
      `SELECT
        m.id, m.subject, m.body, m.read_at, m.created_at, m.reply_to_message_id,
        m.from_user_id, uf.email as from_email, uf.name as from_name,
        m.to_user_id, ut.email as to_email, ut.name as to_name
      FROM messages m
      LEFT JOIN users uf ON m.from_user_id = uf.id
      LEFT JOIN users ut ON m.to_user_id = ut.id
      WHERE m.thread_id = $1 AND (m.from_user_id = $2 OR m.to_user_id = $2) AND m.deleted_at IS NULL
      ORDER BY m.created_at ASC`,
      [threadId, userId]
    );
    return rows.map(this.mapRow);
  }

  async markAsRead(id: string, userId: string): Promise<void> {
    await pgClient.query(
      `UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE id = $1 AND to_user_id = $2`,
      [id, userId]
    );
  }

  async softDelete(id: string, userId: string): Promise<void> {
    await pgClient.query(
      `UPDATE messages SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND (from_user_id = $2 OR to_user_id = $2) AND deleted_at IS NULL`,
      [id, userId]
    );
  }

  async getNotificationPreference(userId: string): Promise<boolean> {
    const { rows } = await pgClient.query(
      `SELECT email_enabled FROM message_notification_preferences WHERE user_id = $1`,
      [userId]
    );
    return rows.length === 0 ? true : rows[0].email_enabled;
  }

  async setNotificationPreference(userId: string, enabled: boolean): Promise<void> {
    await pgClient.query(
      `INSERT INTO message_notification_preferences (user_id, email_enabled, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id)
       DO UPDATE SET email_enabled = $2, updated_at = CURRENT_TIMESTAMP`,
      [userId, enabled]
    );
  }

  private mapRow(row: any): Message {
    return new Message(
      row.id, row.from_user_id, row.to_user_id, row.subject, row.body,
      row.read_at, row.thread_id, row.reply_to_message_id, row.deleted_at, row.created_at
    );
  }
}