import { inject, injectable } from "tsyringe";
import { pgClient } from "@data/orm/pgClient.js";

interface GetMessagesInput {
  userId: string;
  limit: number;
  offset: number;
  unread?: boolean;
  search?: string;
}

interface GetMessagesOutput {
  messages: Array<{
    id: string;
    subject: string;
    body: string;
    readAt: Date | null;
    createdAt: Date;
    threadId: string;
    from: { id: string | null; email: string; name: string };
    to: { id: string; email: string; name: string };
  }>;
  unreadCount: number;
  total: number;
}

@injectable()
export class GetMessagesUseCase {
  async execute(input: GetMessagesInput): Promise<GetMessagesOutput> {
    let query = `
      SELECT
        m.id, m.subject, m.body, m.read_at, m.created_at, m.thread_id,
        u.id as from_user_id, u.email as from_email, u.name as from_name
      FROM messages m
      LEFT JOIN users u ON m.from_user_id = u.id
      WHERE m.to_user_id = $1 AND m.deleted_at IS NULL
    `;
    const params: unknown[] = [input.userId];
    let paramIndex = 2;

    if (input.unread) {
      query += ` AND m.read_at IS NULL`;
    }

    if (input.search) {
      query += ` AND (m.subject ILIKE $${paramIndex} OR m.body ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
      params.push(`%${input.search}%`);
      paramIndex++;
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(input.limit, input.offset);

    const { rows } = await pgClient.query(query, params);

    const { rows: unreadRows } = await pgClient.query(
      `SELECT COUNT(*) as unread FROM messages WHERE to_user_id = $1 AND read_at IS NULL AND deleted_at IS NULL`,
      [input.userId]
    );

    let countQuery = `SELECT COUNT(*) as total FROM messages m`;
    if (input.search) {
      countQuery += ` LEFT JOIN users u ON m.from_user_id = u.id`;
    }
    countQuery += ` WHERE m.to_user_id = $1 AND m.deleted_at IS NULL`;
    const countParams = [input.userId];
    const countParamIndex = 2;

    if (input.unread) {
      countQuery += ` AND m.read_at IS NULL`;
    }
    if (input.search) {
      countQuery += ` AND (m.subject ILIKE $${countParamIndex} OR m.body ILIKE $${countParamIndex} OR u.name ILIKE $${countParamIndex} OR u.email ILIKE $${countParamIndex})`;
      countParams.push(`%${input.search}%`);
    }

    const { rows: totalRows } = await pgClient.query(countQuery, countParams);

    return {
      messages: rows.map(r => ({
        id: r.id,
        subject: r.subject,
        body: r.body,
        readAt: r.read_at,
        createdAt: r.created_at,
        threadId: r.thread_id,
        from: r.from_user_id ? {
          id: r.from_user_id,
          email: r.from_email,
          name: r.from_name
        } : { id: null, email: "system", name: "System Administrator" },
        to: { id: input.userId, email: "", name: "" },
      })),
      unreadCount: parseInt(unreadRows[0].unread),
      total: parseInt(totalRows[0].total),
    };
  }
}