import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { UserStatus } from "@domain/entities/User.js";

interface GetUsersInput {
  page: number;
  limit: number;
  search?: string;
  status?: UserStatus;
  role?: "admin" | "user";
  verified?: boolean;
  sortBy: string;
  order: "ASC" | "DESC";
}

interface GetUsersOutput {
  users: Array<{
    id: string;
    email: string;
    name: string;
    isAdmin: boolean;
    status: UserStatus;
    emailVerified: boolean;
    createdAt: Date;
    lastActive: Date | null;
    stats: { totalChats: number; totalTokens: number };
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@injectable()
export class GetUsersUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository
  ) {}

  async execute(input: GetUsersInput): Promise<GetUsersOutput> {
    const result = await this.userRepo.findAll({
      page: input.page,
      limit: input.limit,
      search: input.search,
      status: input.status,
      role: input.role,
      verified: input.verified,
      sortBy: input.sortBy,
      order: input.order,
    });

    return {
      users: result.users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        isAdmin: u.isAdmin,
        status: u.status,
        emailVerified: u.emailVerified,
        createdAt: u.createdAt,
        lastActive: u.lastActive,
        stats: { totalChats: 0, totalTokens: 0 }, // Would need separate queries
      })),
      pagination: {
        page: input.page,
        limit: input.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / input.limit),
      },
    };
  }
}