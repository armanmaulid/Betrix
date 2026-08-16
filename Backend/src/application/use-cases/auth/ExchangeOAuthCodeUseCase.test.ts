import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExchangeOAuthCodeUseCase } from "./ExchangeOAuthCodeUseCase.js";
import { ValidationError } from "@core/errors/index.js";

function makeUser(id = "u1") {
  return { id, email: "user@example.com" };
}

function makeUseCase(deps: Partial<{
  codeStore: { getAndDelete: ReturnType<typeof vi.fn> };
  sessionRepo: { findByToken: ReturnType<typeof vi.fn> };
  userRepo: { findById: ReturnType<typeof vi.fn> };
}> = {}) {
  const codeStore = deps.codeStore ?? { getAndDelete: vi.fn().mockResolvedValue({ sessionToken: "tok", userId: "u1" }) };
  const sessionRepo = deps.sessionRepo ?? { findByToken: vi.fn().mockResolvedValue({ userId: "u1", token: "tok" }) };
  const userRepo = deps.userRepo ?? { findById: vi.fn().mockResolvedValue(makeUser()) };

  const uc = new ExchangeOAuthCodeUseCase(codeStore as never, sessionRepo as never, userRepo as never);
  return { uc, codeStore, sessionRepo, userRepo };
}

describe("ExchangeOAuthCodeUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exchanges a valid code for session token + user", async () => {
    const user = makeUser();
    const { uc, codeStore, sessionRepo, userRepo } = makeUseCase({ userRepo: { findById: vi.fn().mockResolvedValue(user) } });

    const result = await uc.execute({ code: "code-1" });

    expect(codeStore.getAndDelete).toHaveBeenCalledWith("code-1");
    expect(sessionRepo.findByToken).toHaveBeenCalledWith("tok");
    expect(userRepo.findById).toHaveBeenCalledWith("u1");
    expect(result).toEqual({ sessionToken: "tok", user });
  });

  it("rejects an invalid, expired, or already-used code", async () => {
    const { uc } = makeUseCase({ codeStore: { getAndDelete: vi.fn().mockResolvedValue(null) } });

    await expect(uc.execute({ code: "stale" })).rejects.toThrow(ValidationError);
    await expect(uc.execute({ code: "stale" })).rejects.toThrow("Invalid or expired OAuth code");
  });

  it("rejects a code whose session was logged out in between", async () => {
    const { uc } = makeUseCase({ sessionRepo: { findByToken: vi.fn().mockResolvedValue(null) } });

    await expect(uc.execute({ code: "code-1" })).rejects.toThrow(ValidationError);
  });

  it("rejects a code whose user no longer exists", async () => {
    const { uc } = makeUseCase({ userRepo: { findById: vi.fn().mockResolvedValue(null) } });

    await expect(uc.execute({ code: "code-1" })).rejects.toThrow(ValidationError);
  });
});
