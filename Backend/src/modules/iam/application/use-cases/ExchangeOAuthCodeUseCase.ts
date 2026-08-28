import { inject, injectable } from "tsyringe";
import type { User } from "@domain/entities/User.js";
import { OAuthCodeStore } from "@domain/repositories/OAuthCodeStore.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { ValidationError } from "@core/errors/index.js";

interface ExchangeOAuthCodeInput {
  code: string;
}

@injectable()
export class ExchangeOAuthCodeUseCase {
  constructor(
    @inject("OAuthCodeStore") private codeStore: OAuthCodeStore,
    @inject("SessionRepository") private sessionRepo: SessionRepository,
    @inject("UserRepository") private userRepo: UserRepository
  ) {}

  /**
   * Tukar one-time code OAuth (dari URL redirect) → session token + user.
   * Shape respons = LoginSuccess agar FE bisa langsung loginWithToken.
   * Code single-use + TTL 5 menit; session divalidasi masih hidup.
   */
  async execute(input: ExchangeOAuthCodeInput): Promise<{ sessionToken: string; user: User }> {
    const payload = await this.codeStore.getAndDelete(input.code);
    if (!payload) {
      throw new ValidationError("Invalid or expired OAuth code");
    }

    // Logout terjadi antara redirect & exchange → code dianggap invalid.
    const session = await this.sessionRepo.findByToken(payload.sessionToken);
    if (!session) {
      throw new ValidationError("Invalid or expired OAuth code");
    }

    const user = await this.userRepo.findById(payload.userId);
    if (!user) {
      throw new ValidationError("Invalid or expired OAuth code");
    }

    return { sessionToken: payload.sessionToken, user };
  }
}
