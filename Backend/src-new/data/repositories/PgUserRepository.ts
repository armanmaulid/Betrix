import { injectable } from "tsyringe";
import { pgClient } from "../orm/pgClient.js";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { User, UserStatus } from "@domain/entities/User.js";
import { Email } from "@domain/value-objects";

@injectable()
export class PgUserRepository implements UserRepository {
  async findById(id: string): Promise<User | null> {
    const { rows } = await pgClient.query(
      `SELECT * FROM users WHERE id = $1`, [id]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    const { rows } = await pgClient.query(
      `SELECT * FROM users WHERE lower(email) = lower($1)`, [email.value]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    const { rows } = await pgClient.query(
      `SELECT * FROM users WHERE google_id = $1`, [googleId]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async save(user: User): Promise<User> {
    const { rows } = await pgClient.query(
      `INSERT INTO users (id, email, password_hash, name, is_admin, status, email_verified, credits, google_id, phone, address, birthdate, gender, bio, verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         name = EXCLUDED.name,
         is_admin = EXCLUDED.is_admin,
         status = EXCLUDED.status,
         email_verified = EXCLUDED.email_verified,
         credits = EXCLUDED.credits,
         google_id = EXCLUDED.google_id,
         phone = EXCLUDED.phone,
         address = EXCLUDED.address,
         birthdate = EXCLUDED.birthdate,
         gender = EXCLUDED.gender,
         bio = EXCLUDED.bio,
         verified_at = EXCLUDED.verified_at
       RETURNING *`,
      [
        user.id, user.email, user.passwordHash, user.name,
        user.isAdmin, user.status, user.emailVerified, user.credits,
        user.googleId, user.phone, user.address, user.birthdate,
        user.gender, user.bio, user.verifiedAt
      ]
    );
    return this.mapRow(rows[0]);
  }

  async delete(id: string): Promise<void> {
    await pgClient.query(`DELETE FROM users WHERE id = $1`, [id]);
  }

  async updateStatus(id: string, status: UserStatus): Promise<User | null> {
    const { rows } = await pgClient.query(
      `UPDATE users SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async updateCredits(id: string, amount: number): Promise<User | null> {
    const { rows } = await pgClient.query(
      `UPDATE users SET credits = credits + $1 WHERE id = $2 RETURNING *`,
      [amount, id]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async updateLastActive(id: string): Promise<void> {
    await pgClient.query(
      `UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = $1 AND (last_active IS NULL OR last_active < NOW() - INTERVAL '5 minutes')`,
      [id]
    );
  }

  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    status?: UserStatus;
    role?: "admin" | "user";
    verified?: boolean;
    sortBy: string;
    order: "ASC" | "DESC";
    offset?: number;
  }): Promise<{ users: User[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.search) {
      conditions.push(`(email ILIKE $${paramIndex} OR name ILIKE $${paramIndex})`);
      values.push(`%${params.search}%`);
      paramIndex++;
    }

    if (params.status) {
      conditions.push(`status = $${paramIndex}`);
      values.push(params.status);
      paramIndex++;
    }

    if (params.role === "admin") {
      conditions.push("is_admin = TRUE");
    } else if (params.role === "user") {
      conditions.push("is_admin = FALSE");
    }

    if (params.verified !== undefined) {
      conditions.push(`email_verified = $${paramIndex}`);
      values.push(params.verified);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    const validSorts = ["created_at", "last_active", "email", "name", "status"];
    const sortColumn = validSorts.includes(params.sortBy) ? params.sortBy : "created_at";
    const sortOrder = params.order === "ASC" ? "ASC" : "DESC";

    const countQuery = `SELECT COUNT(*) FROM users ${whereClause}`;
    const { rows: countRows } = await pgClient.query(countQuery, values);
    const total = parseInt(countRows[0].count);

    values.push(params.limit, params.offset || (params.page - 1) * params.limit);
    const query = `
      SELECT * FROM users ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const { rows } = await pgClient.query(query, values);
    return { users: rows.map(this.mapRow), total };
  }

  private mapRow(row: any): User {
    return new User(
      row.id, row.email, row.password_hash, row.name,
      row.is_admin, row.status as UserStatus, row.email_verified, row.credits,
      row.created_at, row.last_active, row.google_id,
      row.phone, row.address, row.birthdate, row.gender, row.bio, row.verified_at
    );
  }
}