import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StreamMessageUseCase } from "./StreamMessageUseCase.js";
import { User, UserStatus } from "@domain/entities/User.js";
import { ChatTaskType } from "@domain/entities/ChatMessage.js";
import { ModelPolicy } from "@domain/services/ModelPolicy.js";
import { InsufficientCreditsError, InternalError } from "@core/errors/index.js";
import type { ChatCompleted } from "@domain/events/index.js";

function makeUser(): User {
  return new User(
    "u1",
    "user@example.com",
    "$2a$10$hashhashhashhashhashhashhashhashhashhashhashhashha",
    "Test User",
    false,
    UserStatus.ACTIVE,
    true,
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

function makeUseCase(deps: Partial<{
  userRepo: { findById: ReturnType<typeof vi.fn> };
  creditRepo: { deduct: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn> };
  aiPort: { streamModel: ReturnType<typeof vi.fn> };
  eventDispatcher: { dispatch: ReturnType<typeof vi.fn> };
  modelPolicy: { resolveTier: ReturnType<typeof vi.fn>; resolveModel: ReturnType<typeof vi.fn> };
  promptRegistry: { getSystemPrompt: ReturnType<typeof vi.fn> };
  contextService: { buildContext: ReturnType<typeof vi.fn> };
}> = {}) {
  const userRepo = deps.userRepo ?? { findById: vi.fn().mockResolvedValue(makeUser()) };
  const chatRepo = {}; // Not called by execute() — injected but unused (reserved).
  const creditRepo = deps.creditRepo ?? {
    deduct: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
  };
  const aiPort = deps.aiPort ?? {
    streamModel: vi.fn().mockResolvedValue({ text: "hasil analisis", usage: { inputTokens: 10, outputTokens: 20 } }),
  };
  const cachePort = {}; // Not called by execute() — injected but unused (reserved).
  const eventDispatcher = deps.eventDispatcher ?? { dispatch: vi.fn() };
  const promptRegistry = deps.promptRegistry ?? { getSystemPrompt: vi.fn().mockReturnValue("system prompt") };
  const modelPolicy = deps.modelPolicy ?? {
    resolveTier: vi.fn().mockReturnValue("balanced"),
    resolveModel: vi.fn().mockReturnValue({ id: "model-x", maxTokens: 4096 }),
  };
  const contextService = deps.contextService ?? { buildContext: vi.fn().mockResolvedValue(null) };

  const uc = new StreamMessageUseCase(
    userRepo as never,
    chatRepo as never,
    creditRepo as never,
    aiPort as never,
    cachePort as never,
    eventDispatcher as never,
    promptRegistry as never,
    modelPolicy as never,
    contextService as never
  );

  return { uc, userRepo, creditRepo, aiPort, eventDispatcher, modelPolicy, promptRegistry, contextService };
}

const baseInput = {
  userId: "u1",
  taskType: ChatTaskType.MARKET_INSIGHT,
  message: "analisa EURUSD",
  history: [],
  onToken: vi.fn(),
};

describe("StreamMessageUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("measures real elapsed latency instead of hardcoding 0", async () => {
    const { uc } = makeUseCase({
      aiPort: {
        streamModel: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 30));
          return { text: "ok", usage: { inputTokens: 5, outputTokens: 5 } };
        }),
      },
    });

    const result = await uc.execute(baseInput);

    // Nilai persis tidak deterministik (timer nyata), tapi HARUS > 0 dan
    // masuk akal untuk jeda ~30ms — ini regression guard untuk bug lama
    // yang selalu mengembalikan latencyMs: 0.
    expect(result.latencyMs).toBeGreaterThan(0);
    expect(result.latencyMs).toBeLessThan(2000);
  });

  it("reports zero-floor latency for an instantaneous mock without going negative", async () => {
    const { uc } = makeUseCase({
      aiPort: { streamModel: vi.fn().mockResolvedValue({ text: "ok" }) },
    });

    const result = await uc.execute(baseInput);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("dispatches ChatCompleted with the same latencyMs returned to the caller", async () => {
    const { uc, eventDispatcher } = makeUseCase({
      aiPort: {
        streamModel: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 10));
          return { text: "hasil", usage: { inputTokens: 1, outputTokens: 1 } };
        }),
      },
    });

    const result = await uc.execute(baseInput);

    expect(eventDispatcher.dispatch).toHaveBeenCalledTimes(1);
    const dispatched = eventDispatcher.dispatch.mock.calls[0][0] as ChatCompleted;
    expect(dispatched.payload.latencyMs).toBe(result.latencyMs);
  });

  it("throws InsufficientCreditsError and does not call the AI when credit deduction fails", async () => {
    const creditRepo = {
      deduct: vi.fn().mockRejectedValue(new Error("Insufficient credits")),
      add: vi.fn(),
    };
    const aiPort = { streamModel: vi.fn() };
    const { uc } = makeUseCase({ creditRepo, aiPort });

    await expect(uc.execute(baseInput)).rejects.toThrow(InsufficientCreditsError);
    expect(aiPort.streamModel).not.toHaveBeenCalled();
    expect(creditRepo.add).not.toHaveBeenCalled(); // No refund — credits were never deducted.
  });

  it("refunds credits when the AI call fails after a successful deduction", async () => {
    const creditRepo = {
      deduct: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(undefined),
    };
    const modelPolicy = {
      resolveTier: vi.fn().mockReturnValue("deep"),
      resolveModel: vi.fn().mockReturnValue({ id: "model-x", maxTokens: 4096 }),
    };
    const aiPort = { streamModel: vi.fn().mockRejectedValue(new Error("upstream timeout")) };
    const { uc } = makeUseCase({ creditRepo, aiPort, modelPolicy });

    await expect(uc.execute(baseInput)).rejects.toThrow(InternalError);
    expect(creditRepo.add).toHaveBeenCalledWith("u1", ModelPolicy.TIER_CREDIT_COST.deep, "refund_chat_deep");
  });

  it("does not refund when the AI call fails before any deduction occurred", async () => {
    // Deduct itself throws a non-credits error (e.g. DB error) — creditsDeducted stays false.
    const creditRepo = {
      deduct: vi.fn().mockRejectedValue(new Error("db unavailable")),
      add: vi.fn(),
    };
    const { uc } = makeUseCase({ creditRepo });

    await expect(uc.execute(baseInput)).rejects.toThrow("db unavailable");
    expect(creditRepo.add).not.toHaveBeenCalled();
  });

  it("throws InternalError when the user is not found", async () => {
    const userRepo = { findById: vi.fn().mockResolvedValue(null) };
    const { uc } = makeUseCase({ userRepo });

    await expect(uc.execute(baseInput)).rejects.toThrow(InternalError);
  });

  it("forwards onToken through to the AI port for live streaming", async () => {
    const onToken = vi.fn();
    const streamModel = vi.fn().mockResolvedValue({ text: "ok" });
    const { uc } = makeUseCase({ aiPort: { streamModel } });

    await uc.execute({ ...baseInput, onToken });

    expect(streamModel).toHaveBeenCalledWith(
      expect.objectContaining({ onToken })
    );
  });
});
