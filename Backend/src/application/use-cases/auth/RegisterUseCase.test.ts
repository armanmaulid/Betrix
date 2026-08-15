import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RegisterUseCase } from "./RegisterUseCase.js";
import { User } from "@domain/entities/User.js";
import { ValidationError, ConflictError } from "@core/errors/index.js";
import type { AppSettings } from "@core/settings/AppSettings.js";

// Mock crypto utils so registration is deterministic and fast.
vi.mock("@core/utils/index.js", () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn().mockResolvedValue("hashed-password"),
  generateSecureToken: vi.fn().mockReturnValue("secure-token-16"),
  generateOTP: vi.fn().mockReturnValue("123456"),
  stripThinkingTags: vi.fn((t: string) => t),
}));

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
  userRepo: { findByEmail: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  deviceRepo: { findUserByFingerprint: ReturnType<typeof vi.fn>; bind: ReturnType<typeof vi.fn> };
  verificationRepo: { create: ReturnType<typeof vi.fn> };
  emailPort: { sendVerificationEmail: ReturnType<typeof vi.fn>; sendDuplicateRegistrationNotice: ReturnType<typeof vi.fn> };
  sessionRepo: { save: ReturnType<typeof vi.fn> };
  settings: AppSettings;
}> = {}) {
  const userRepo = deps.userRepo ?? {
    findByEmail: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const sessionRepo = deps.sessionRepo ?? { save: vi.fn().mockResolvedValue(undefined) };
  const deviceRepo = deps.deviceRepo ?? {
    findUserByFingerprint: vi.fn().mockResolvedValue(null),
    bind: vi.fn().mockResolvedValue(undefined),
  };
  const verificationRepo = deps.verificationRepo ?? { create: vi.fn().mockResolvedValue(undefined) };
  const emailPort = deps.emailPort ?? {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendDuplicateRegistrationNotice: vi.fn().mockResolvedValue(undefined),
  };
  const settings = deps.settings ?? makeSettings();

  const uc = new RegisterUseCase(
    userRepo as never,
    sessionRepo as never,
    deviceRepo as never,
    verificationRepo as never,
    emailPort as never,
    settings as never
  );

  return { uc, userRepo, sessionRepo, deviceRepo, verificationRepo, emailPort };
}

const validInput = {
  email: "new@example.com",
  password: "password123",
  name: "New User",
  request: {
    ip: "1.2.3.4",
    headers: { "user-agent": "Chrome/120" },
    userAgent: "Chrome/120",
  },
};

describe("RegisterUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects passwords shorter than the minimum length", async () => {
    const { uc } = makeUseCase();
    await expect(uc.execute({ ...validInput, password: "short" })).rejects.toThrow(ValidationError);
  });

  it("rejects a device already bound to another account when enforcement is on", async () => {
    const deviceRepo = {
      findUserByFingerprint: vi.fn().mockResolvedValue("other-user-id"),
      bind: vi.fn(),
    };
    const { uc } = makeUseCase({ deviceRepo, settings: makeSettings({ deviceEnforcementEnabled: true }) });

    await expect(uc.execute(validInput)).rejects.toThrow(ConflictError);
    expect(deviceRepo.bind).not.toHaveBeenCalled();
  });

  it("returns the existing user without creating a new one for a duplicate email", async () => {
    const existing = User.create({ id: "existing-id", email: "new@example.com", passwordHash: "h", name: "Old" });
    const userRepo = {
      findByEmail: vi.fn().mockResolvedValue(existing),
      save: vi.fn(),
    };
    const emailPort = {
      sendVerificationEmail: vi.fn(),
      sendDuplicateRegistrationNotice: vi.fn().mockResolvedValue(undefined),
    };
    const { uc } = makeUseCase({ userRepo, emailPort });

    const result = await uc.execute(validInput);
    expect(result.user.id).toBe("existing-id");
    expect(result.sessionToken).toBe("");
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(emailPort.sendDuplicateRegistrationNotice).toHaveBeenCalledWith("new@example.com");
  });

  it("registers a new user, sends verification, and creates a session", async () => {
    const { uc, userRepo, sessionRepo, verificationRepo, emailPort } = makeUseCase();

    const result = await uc.execute(validInput);

    expect(result.user.email).toBe("new@example.com");
    expect(result.sessionToken).toBeTruthy();
    expect(userRepo.save).toHaveBeenCalledTimes(1);
    expect(verificationRepo.create).toHaveBeenCalledWith(expect.any(String), "123456", expect.any(Number));
    expect(emailPort.sendVerificationEmail).toHaveBeenCalledWith("new@example.com", "123456");
    expect(sessionRepo.save).toHaveBeenCalledTimes(1);
  });

  it("binds the device fingerprint when enforcement is enabled", async () => {
    const deviceRepo = {
      findUserByFingerprint: vi.fn().mockResolvedValue(null),
      bind: vi.fn().mockResolvedValue(undefined),
    };
    const { uc } = makeUseCase({ deviceRepo, settings: makeSettings({ deviceEnforcementEnabled: true }) });

    await uc.execute(validInput);
    expect(deviceRepo.findUserByFingerprint).toHaveBeenCalled();
    expect(deviceRepo.bind).toHaveBeenCalledTimes(1);
  });
});
