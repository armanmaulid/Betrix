import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { User } from "@domain/entities/User.js";
import { NotFoundError, AuthenticationError } from "@core/errors/index.js";

interface GetProfileInput {
  sessionToken: string;
}

interface GetProfileOutput {
  user: User;
}

@injectable()
export class GetProfileUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository
  ) {}

  async execute(input: GetProfileInput): Promise<GetProfileOutput> {
    const session = await this.sessionRepo.findByToken(input.sessionToken);
    if (!session) {
      throw new AuthenticationError("Session not found or expired");
    }

    const user = await this.userRepo.findById(session.userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    return { user };
  }
}