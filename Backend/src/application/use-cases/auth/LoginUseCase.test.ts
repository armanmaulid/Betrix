import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LoginUseCase } from "./LoginUseCase.js";
import { User, UserStatus } from "@domain/entities/User.js";
import { AuthenticationError } from "@core/errors/index.js";
import type { AppSettings } from "@core/settings/AppSettings.js";

// Mock bcrypt-based utils so tests stay fast and deterministic.
vi.mock("@core/utils/index.js", () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
  generateSecureToken: vi.fn(),
  generateOTP: vi.fn(),
  stripThinkingTags: vi.fn((t: string) => t),
}));

import { verifyPassword } from "@core/utils/index.js";

function makeUser(opts: { status?: UserStatus; emailVerified?: boolean } = {}): User {
  return new User(
    "u1",
    "user@example.com",
    "$2a$10$hashhashhashhashhashhashhashhashhashhashhashhashha",
    "Test User",
    false,
    opts.status ?? UserStatus.ACTIVE,
    opts.emailVerified ?? true,
    100,
    new Date(),
    new Date(),
    null,
    null,
    null,
    null,
    null,
    null,
    null
  );
}

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    requireEmailVerification: false,
    deviceEnforcementEnabled: false,
    trackCalendar: true,
    trackPrices: true,
    trackOhlc: true,
    trackMbook: true,
    trackingSymbols: ["EURUSD"],
    brokerUtcOffset: 0,
    ...overrides,
  };
}

function makeUseCase(deps: Partial<{
  userRepo: { findByEmail: ReturnType<typeof vi.fn> };
  loginAttemptRepo: {
    isAccountLocked: ReturnType<typeof vi.fn>;
    recordFailedLogin: ReturnType<typeof vi.fn>;
    clearFailedLogins: ReturnType<typeof vi.fn>;
  };
  authDomainService: { establishAuthenticatedSession: ReturnType<typeof vi.fn> };
  activityLogRepo: { logUserActivity: ReturnType<typeof vi.fn> };
  settings: AppSettings;
}> = {}) {
  const activityLogRepo = deps.activityLogRepo ?? { logUserActivity: vi.fn().mockResolvedValue(undefined) };
  const userRepo = deps.userRepo ?? { findByEmail: vi.fn().mockResolvedValue(null) };
  const sessionRepo = { save: vi.fn().mockResolvedValue(undefined) };
  const deviceRepo = { bind: vi.fn().mockResolvedValue(undefined) };
  const loginAttemptRepo = deps.loginAttemptRepo ?? {
    isAccountLocked: vi.fn().mockResolvedValue(false),
    recordFailedLogin: vi.fn().mockResolvedValue(undefined),
    clearFailedLogins: vi.fn().mockResolvedValue(undefined),
  };
  const deviceSessionRepo = { setSessionForDeviceAtomic: vi.fn().mockResolvedValue({ success: true }) };
  const authDomainService = deps.authDomainService ?? {
    establishAuthenticatedSession: vi.fn().mockResolvedValue({ ok: true, user: null, sessionToken: "tok" }),
  };
  const settings = deps.settings ?? makeSettings();

  const uc = new LoginUseCase(
    activityLogRepo as never,
    userRepo as never,
    sessionRepo as never,
    deviceRepo as never,
    loginAttemptRepo as never,
    deviceSessionRepo as never,
    authDomainService as never,
    settings as never
  );

  return { uc, activityLogRepo, userRepo, loginAttemptRepo, authDomainService };
}

const validInput = {
  email: "user@example.com",
  password: "password123",
  request: {
    ip: "1.2.3.4",
    headers: { "user-agent": "Chrome/120" },
    userAgent: "Chrome/120",
  },
};

describe("LoginUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws AuthenticationError when the account is locked", async () => {
    const loginAttemptRepo = {
      isAccountLocked: vi.fn().mockResolvedValue(true),
      recordFailedLogin: vi.fn(),
      clearFailedLogins: vi.fn(),
    };
    const { uc } = makeUseCase({ loginAttemptRepo });

    await expect(uc.execute(validInput)).rejects.toThrow(AuthenticationError);
    expect(loginAttemptRepo.recordFailedLogin).not.toHaveBeenCalled();
  });

  it("records a failed login and throws for an unknown email", async () => {
    (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const userRepo = { findByEmail: vi.fn().mockResolvedValue(null) };
    const loginAttemptRepo = {
      isAccountLocked: vi.fn().mockResolvedValue(false),
      recordFailedLogin: vi.fn(),
      clearFailedLogins: vi.fn(),
    };
    const { uc } = makeUseCase({ userRepo, loginAttemptRepo });

    await expect(uc.execute(validInput)).rejects.toThrow(AuthenticationError);
    expect(loginAttemptRepo.recordFailedLogin).toHaveBeenCalledWith("user@example.com", "1.2.3.4");
  });

  it("rejects a wrong password", async () => {
    (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const userRepo = { findByEmail: vi.fn().mockResolvedValue(makeUser()) };
    const loginAttemptRepo = {
      isAccountLocked: vi.fn().mockResolvedValue(false),
      recordFailedLogin: vi.fn(),
      clearFailedLogins: vi.fn(),
    };
    const { uc } = makeUseCase({ userRepo, loginAttemptRepo });

    await expect(uc.execute(validInput)).rejects.toThrow(AuthenticationError);
    expect(loginAttemptRepo.recordFailedLogin).toHaveBeenCalled();
    expect(loginAttemptRepo.clearFailedLogins).not.toHaveBeenCalled();
  });

  it("rejects a banned account", async () => {
    (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const userRepo = { findByEmail: vi.fn().mockResolvedValue(makeUser({ status: UserStatus.BANNED })) };
    const { uc } = makeUseCase({ userRepo });

    await expect(uc.execute(validInput)).rejects.toThrow("banned");
  });

  it("rejects unverified email when verification is required", async () => {
    (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const userRepo = { findByEmail: vi.fn().mockResolvedValue(makeUser({ emailVerified: false })) };
    const { uc } = makeUseCase({ userRepo, settings: makeSettings({ requireEmailVerification: true }) });

    await expect(uc.execute(validInput)).rejects.toThrow("Email not verified");
  });

  it("returns a session on successful login", async () => {
    (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const user = makeUser();
    const userRepo = { findByEmail: vi.fn().mockResolvedValue(user) };
    const authDomainService = {
      establishAuthenticatedSession: vi.fn().mockResolvedValue({ ok: true, user, sessionToken: "session-abc" }),
    };
    const activityLogRepo = { logUserActivity: vi.fn().mockResolvedValue(undefined) };
    const { uc } = makeUseCase({ userRepo, authDomainService, activityLogRepo });

    const result = await uc.execute(validInput);
    expect(result.sessionToken).toBe("session-abc");
    expect(result.user).toBe(user);
    expect(authDomainService.establishAuthenticatedSession).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ ip: "1.2.3.4" }),
      false
    );
    expect(activityLogRepo.logUserActivity).toHaveBeenCalled();
  });

  it("passes device enforcement flag through to the auth service", async () => {
    (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const user = makeUser();
    const userRepo = { findByEmail: vi.fn().mockResolvedValue(user) };
    const authDomainService = {
      establishAuthenticatedSession: vi.fn().mockResolvedValue({ ok: true, user, sessionToken: "s" }),
    };
    const { uc } = makeUseCase({ userRepo, authDomainService, settings: makeSettings({ deviceEnforcementEnabled: true }) });

    await uc.execute(validInput);
    expect(authDomainService.establishAuthenticatedSession).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ ip: "1.2.3.4" }),
      true
    );
  });
});
