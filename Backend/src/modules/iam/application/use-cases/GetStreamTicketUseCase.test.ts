import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetStreamTicketUseCase } from "./GetStreamTicketUseCase.js";
import { AuthenticationError } from "@core/errors/index.js";

function makeUseCase(deps: Partial<{
  sessionRepo: { findByToken: ReturnType<typeof vi.fn> };
  ticketStore: { save: ReturnType<typeof vi.fn> };
}> = {}) {
  const sessionRepo = deps.sessionRepo ?? { findByToken: vi.fn().mockResolvedValue({ userId: "u1", token: "tok" }) };
  const ticketStore = deps.ticketStore ?? { save: vi.fn().mockResolvedValue(undefined) };

  const uc = new GetStreamTicketUseCase(sessionRepo as never, ticketStore as never);
  return { uc, sessionRepo, ticketStore };
}

describe("GetStreamTicketUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a single-use ticket for a valid session", async () => {
    const { uc, sessionRepo, ticketStore } = makeUseCase();

    const result = await uc.execute({ sessionToken: "session-abc" });

    expect(sessionRepo.findByToken).toHaveBeenCalledWith("session-abc");
    expect(result.ticket).toBeTruthy();
    expect(result.ticket.length).toBeGreaterThan(32);
    // Ticket menyimpan sessionToken (bukan userId) agar logout membatalkannya.
    expect(ticketStore.save).toHaveBeenCalledWith(result.ticket, "session-abc", 60);
  });

  it("throws 401 for an invalid or expired session", async () => {
    const { uc } = makeUseCase({ sessionRepo: { findByToken: vi.fn().mockResolvedValue(null) } });

    await expect(uc.execute({ sessionToken: "bad" })).rejects.toThrow(AuthenticationError);
  });

  it("does not save a ticket when the session is invalid", async () => {
    const { uc, ticketStore } = makeUseCase({ sessionRepo: { findByToken: vi.fn().mockResolvedValue(null) } });

    await expect(uc.execute({ sessionToken: "bad" })).rejects.toThrow(AuthenticationError);
    expect(ticketStore.save).not.toHaveBeenCalled();
  });
});
