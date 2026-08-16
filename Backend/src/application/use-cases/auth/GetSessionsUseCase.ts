import { inject, injectable } from "tsyringe";
import { UserRepository } from "@domain/repositories/UserRepository.js";
import { SessionRepository } from "@domain/repositories/SessionRepository.js";
import { DeviceRepository } from "@domain/repositories/DeviceRepository.js";
import { AuthenticationError } from "@core/errors/index.js";

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

    // Ambil semua session user untuk melengkapi ip/userAgent per device.
    // (Satu query — metadata session disimpan di Redis sejak format v2.)
    const userSessions = await this.sessionRepo.findByUserId(session.userId);

    // Session yang di-resolve dari token request = device yang sedang dipakai
    // sekarang. Bandingkan fingerprint-nya, BUKAN token vs fingerprint
    // (set session token yang lama keliru — tak pernah match).
    const currentFingerprint = session.deviceFingerprint;

    // Device aktif tidak selalu punya baris device sendiri (enforcement OFF),
    // jadi fallback ke metadata session request itu sendiri.
    const currentIp = session.ip;
    const currentUserAgent = session.userAgent;

    // Fingerprint → ip/userAgent session terbaru (untuk device yang ter-bind).
    // Pilih session dengan createdAt TERBARU per fingerprint — kalau device punya
    // >1 session aktif (login 2x / IP berubah), metadata yang ditampilkan harus
    // yang terbaru (urutan SMEMBERS Redis tidak dijamin, first-seen bisa acak).
    const sessionMetaByFingerprint = new Map<string, { ip: string | null; userAgent: string | null; createdAt: Date }>();
    for (const s of userSessions) {
      if (!s.deviceFingerprint) continue;
      const existing = sessionMetaByFingerprint.get(s.deviceFingerprint);
      if (!existing || s.createdAt > existing.createdAt) {
        sessionMetaByFingerprint.set(s.deviceFingerprint, { ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt });
      }
    }

    const sessionInfos: SessionInfo[] = devices.map(device => {
      const meta = sessionMetaByFingerprint.get(device.fingerprint);
      const isCurrent = currentFingerprint !== null && device.fingerprint === currentFingerprint;
      return {
        fingerprint: device.fingerprint,
        createdAt: device.createdAt,
        lastSeenAt: device.lastSeenAt,
        // Device aktif: metadata dari session request. Device lain: metadata
        // dari session yang fingerprint-nya cocok (fallback null).
        ip: isCurrent ? currentIp : (meta?.ip ?? null),
        userAgent: isCurrent ? currentUserAgent : (meta?.userAgent ?? null),
        current: isCurrent,
      };
    });

    return { sessions: sessionInfos };
  }
}