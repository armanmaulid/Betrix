import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { ChatRepository } from "@domain/repositories/ChatRepository.js";
import { User, UserStatus } from "@domain/entities/User.js";
import { NotFoundError } from "@core/errors/index.js";
import { pgClient } from "@data/orm/pgClient.js";

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
    @inject("ChatRepository") private chatRepo: ChatRepository
  ) {}

  async execute(input: GetUserDetailInput): Promise<GetUserDetailOutput> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    const { rows: statsRows } = await pgClient.query(
      `SELECT
        (SELECT COUNT(*) FROM chat_logs WHERE user_id = $1) as total_chats,
        (SELECT COALESCE(SUM(total_tokens), 0) FROM token_usage WHERE user_id = $1) as total_tokens,
        (SELECT COUNT(*) FROM token_usage WHERE user_id = $1) as total_requests
      `,
      [input.userId]
    );

    const { rows: recentActivity } = await pgClient.query(
      `SELECT task_type, model_used, total_tokens, latency_ms, created_at
       FROM token_usage
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [input.userId]
    );

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
      stats: {
        totalChats: parseInt(statsRows[0].total_chats),
        totalTokens: parseInt(statsRows[0].total_tokens),
        totalRequests: parseInt(statsRows[0].total_requests),
      },
      recentActivity: recentActivity.map(a => ({
        taskType: a.task_type,
        model: a.model_used,
        tokens: parseInt(a.total_tokens),
        latency: a.latency_ms,
        timestamp: a.created_at,
      })),
    };
  }
}