import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { DeviceRepository } from "@domain/repositories/DeviceRepository.js";
import { User } from "@domain/entities/User.js";
import { NotFoundError, AuthenticationError } from "@core/errors/index.js";

interface GetSessionsInput {
  sessionToken: string;
}

interface SessionInfo {
  fingerprint: string;
  createdAt: Date;
  lastSeenAt: Date;
  ip: string | null;
  userAgent: string | null;
  current: boolean;
}

interface GetSessionsOutput {
  sessions: SessionInfo[];
}

@injectable()
export class GetSessionsUseCase {
  constructor(
    @inject("UserRepository") private userRepo: UserRepository,
    @inject("SessionRepository") private sessionRepo: SessionRepository,
    @inject("DeviceRepository") private deviceRepo: DeviceRepository
  ) {}

  async execute(input: GetSessionsInput): Promise<GetSessionsOutput> {
    const session = await this.sessionRepo.findByToken(input.sessionToken);
    if (!session) {
      throw new AuthenticationError("Session not found or expired");
    }

    const devices = await this.deviceRepo.findByUserId(session.userId);
    const sessions = await this.sessionRepo.findByUserId(session.userId);

    const sessionTokens = new Set(sessions.map(s => s.token));

    const sessionInfos: SessionInfo[] = devices.map(device => ({
      fingerprint: device.fingerprint,
      createdAt: device.createdAt,
      lastSeenAt: device.lastSeenAt,
      ip: null,
      userAgent: null,
      current: sessionTokens.has(device.fingerprint), // Simplified
    }));

    return { sessions: sessionInfos };
  }
}