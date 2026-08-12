import { inject, injectable } from "tsyringe";
import { UserActivityRepository } from "@domain/repositories/UserActivityRepository.js";

interface GetUserActivityRequest {
  userId: string;
  page?: number;
  limit?: number;
  action?: string;
  from?: Date;
  to?: Date;
}

@injectable()
export class GetUserActivityUseCase {
  constructor(
    @inject("UserActivityRepository") private activityRepo: UserActivityRepository
  ) {}

  async execute(req: GetUserActivityRequest) {
    const page = Math.max(req.page || 1, 1);
    const limit = Math.min(Math.max(req.limit || 25, 1), 100);

    const result = await this.activityRepo.findAll({
      userId: req.userId,
      page,
      limit,
      action: req.action,
      from: req.from,
      to: req.to
    });

    return {
      activities: result.activities.map(a => ({
        id: a.id,
        action: a.action,
        details: a.details,
        ip: a.ip,
        timestamp: a.createdAt
      })),
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit)
      }
    };
  }
}
