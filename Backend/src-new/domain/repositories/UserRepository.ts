import { User, UserStatus } from "../entities/User.js";
import { Email } from "../value-objects/index.js";

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: Email): Promise<User | null>;
  findByGoogleId(googleId: string): Promise<User | null>;
  save(user: User): Promise<User>;
  delete(id: string): Promise<void>;
  updateStatus(id: string, status: UserStatus): Promise<User | null>;
  updateCredits(id: string, amount: number): Promise<User | null>;
  updateLastActive(id: string): Promise<void>;
  findAll(params: {
    page: number;
    limit: number;
    search?: string;
    status?: UserStatus;
    role?: "admin" | "user";
    verified?: boolean;
    sortBy: string;
    order: "ASC" | "DESC";
  }): Promise<{ users: User[]; total: number }>;
}