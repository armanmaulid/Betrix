import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { ChatRepository } from "@domain/repositories/ChatRepository.js";
import { UserStatus } from "@domain/entities/User.js";
import { NotFoundError } from "@core/errors/index.js";
import { AnalyticsRepository } from "@domain/repositories/AnalyticsRepository.js";

interface GetUserDetailInput {
  userId: string;
}

interface GetUserDetailOutput {
  user: {
    id: string;
    email: string;
    name: string;
    isAdmin: boolean;
    status: UserStatus;
    emailVerified: boolean;
    verifiedAt: Date | null;
    createdAt: Date;
    lastActive: Date | null;
  };
  stats: {
    totalChats: number;
    totalTokens: number;
    totalRequests: number;
  };
  recentActivity: Array<{
    taskType: string;
    model: string;
    tokens: number;
    latency: number | null;
    timestamp: Date;
  }>;
}

@injectable()
export class GetUserDetailUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("ChatRepository") private chatRepo: ChatRepository,
    @inject("AnalyticsRepository") private analyticsRepo: AnalyticsRepository
  ) {}

  async execute(input: GetUserDetailInput): Promise<GetUserDetailOutput> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    const stats = await this.analyticsRepo.getUserDetailStats(input.userId);
    const recentActivity = await this.analyticsRepo.getUserRecentActivity(input.userId, 10);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        status: user.status,
        emailVerified: user.emailVerified,
        verifiedAt: user.verifiedAt,
        createdAt: user.createdAt,
        lastActive: user.lastActive,
      },
      stats,
      recentActivity,
    };
  }
}