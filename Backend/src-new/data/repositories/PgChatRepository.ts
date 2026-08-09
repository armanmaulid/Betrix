import { injectable } from "tsyringe";
import { pgClient } from "../orm/pgClient.js";
import { ChatRepository } from "@domain/repositories/ChatRepository.js";
import { ChatMessage, ChatTaskType } from "@domain/entities/ChatMessage.js";

@injectable()
export class PgChatRepository implements ChatRepository {
  async save(message: ChatMessage): Promise<ChatMessage> {
    const { rows } = await pgClient.query(
      `INSERT INTO chat_logs (id, user_id, session_id, task_type, model_used, message, reply, latency_ms, input_tokens, output_tokens, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        message.id, message.userId, message.sessionId,
        message.taskType, message.modelUsed, message.message, message.reply,
        message.latencyMs, message.inputTokens, message.outputTokens, message.createdAt
      ]
    );
    return this.mapRow(rows[0]);
  }

  async findByUserId(userId: string, params: {
    limit: number;
    offset: number;
    taskType?: ChatTaskType;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{ messages: ChatMessage[]; total: number }> {
    const conditions = ["user_id = $1"];
    const values: unknown[] = [userId];
    let paramIndex = 2;

    if (params.taskType) {
      conditions.push(`task_type = $${paramIndex}`);
      values.push(params.taskType);
      paramIndex++;
    }
    if (params.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      values.push(params.startDate);
      paramIndex++;
    }
    if (params.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      values.push(params.endDate);
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");
    const countQuery = `SELECT COUNT(*) FROM chat_logs WHERE ${whereClause}`;
    const { rows: countRows } = await pgClient.query(countQuery, values);
    const total = parseInt(countRows[0].count);

    values.push(params.limit, params.offset);
    const query = `
      SELECT * FROM chat_logs WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const { rows } = await pgClient.query(query, values);
    return { messages: rows.map(this.mapRow), total };
  }

  async findSessionsByUserId(userId: string, params: {
    limit: number;
    offset: number;
    taskType?: ChatTaskType;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{ sessions: Array<{ sessionId: string; start: Date; end: Date; title: string; turns: any[] }>; total: number }> {
    const conditions = ["user_id = $1"];
    const values: unknown[] = [userId];
    let paramIndex = 2;

    if (params.taskType) {
      conditions.push(`task_type = $${paramIndex}`);
      values.push(params.taskType);
      paramIndex++;
    }
    if (params.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      values.push(params.startDate);
      paramIndex++;
    }
    if (params.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      values.push(params.endDate);
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");
    const countQuery = `SELECT COUNT(DISTINCT COALESCE(session_id, id)) FROM chat_logs WHERE ${whereClause}`;
    const { rows: countRows } = await pgClient.query(countQuery, values);
    const total = parseInt(countRows[0].count);

    values.push(params.limit, params.offset);
    const query = `
      SELECT
        COALESCE(session_id, id) as session_id,
        MIN(created_at) as session_start,
        MAX(created_at) as created_at,
        (array_agg(message ORDER BY created_at ASC))[1] as title,
        json_agg(
          json_build_object(
            'message', message,
            'reply', reply,
            'model_used', model_used,
            'latency_ms', latency_ms
          ) ORDER BY created_at ASC
        ) as turns
      FROM chat_logs
      WHERE ${whereClause}
      GROUP BY COALESCE(session_id, id)
      ORDER BY MAX(created_at) DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const { rows } = await pgClient.query(query, values);
    const sessions = rows.map(r => ({
      sessionId: r.session_id,
      start: r.session_start,
      end: r.created_at,
      title: r.title,
      turns: r.turns,
    }));
    return { sessions, total };
  }

  async deleteSession(userId: string, sessionId: string): Promise<number> {
    const { rowCount } = await pgClient.query(
      `DELETE FROM chat_logs WHERE user_id = $1 AND (session_id = $2::uuid OR id = $2::uuid)`,
      [userId, sessionId]
    );
    return rowCount || 0;
  }

  async findForExport(userId: string, params: {
    taskType?: ChatTaskType;
    startDate?: Date;
    endDate?: Date;
  }): Promise<ChatMessage[]> {
    const conditions = ["user_id = $1"];
    const values: unknown[] = [userId];
    let paramIndex = 2;

    if (params.taskType) {
      conditions.push(`task_type = $${paramIndex}`);
      values.push(params.taskType);
      paramIndex++;
    }
    if (params.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      values.push(params.startDate);
      paramIndex++;
    }
    if (params.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      values.push(params.endDate);
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");
    const query = `
      SELECT * FROM chat_logs WHERE ${whereClause}
      ORDER BY created_at DESC
    `;
    const { rows } = await pgClient.query(query, values);
    return rows.map(this.mapRow);
  }

  private mapRow(row: any): ChatMessage {
    return new ChatMessage(
      row.id, row.user_id, row.session_id, row.task_type,
      row.model_used, row.message, row.reply, row.latency_ms,
      row.input_tokens, row.output_tokens, row.created_at
    );
  }
}