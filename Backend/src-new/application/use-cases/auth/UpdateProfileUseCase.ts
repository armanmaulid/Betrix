import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { User } from "@domain/entities/User.js";
import { NotFoundError, AuthenticationError } from "@core/errors/index.js";

interface UpdateProfileInput {
  sessionToken: string;
  name?: string;
  phone?: string;
  address?: string;
  birthdate?: Date;
  gender?: string;
  bio?: string;
}

interface UpdateProfileOutput {
  user: User;
}

@injectable()
export class UpdateProfileUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository
  ) {}

  async execute(input: UpdateProfileInput): Promise<UpdateProfileOutput> {
    const session = await this.sessionRepo.findByToken(input.sessionToken);
    if (!session) {
      throw new AuthenticationError("Session not found or expired");
    }

    const user = await this.userRepo.findById(session.userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    const updates: Partial<Pick<User, "name" | "phone" | "address" | "birthdate" | "gender" | "bio">> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.phone !== undefined) updates.phone = input.phone;
    if (input.address !== undefined) updates.address = input.address;
    if (input.birthdate !== undefined) updates.birthdate = input.birthdate;
    if (input.gender !== undefined) updates.gender = input.gender;
    if (input.bio !== undefined) updates.bio = input.bio;

    const updatedUser = user.withUpdatedProfile(updates);
    await this.userRepo.save(updatedUser);

    return { user: updatedUser };
  }
}