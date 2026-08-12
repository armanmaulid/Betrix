import type { UserActivity } from "../entities/UserActivity.js";

export interface UserActivityRepository {
  findAll(params: {
    userId: string;
    page: number;
    limit: number;
    action?: string;
    from?: Date;
    to?: Date;
  }): Promise<{ activities: UserActivity[]; total: number }>;
}
