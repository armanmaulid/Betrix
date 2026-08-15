import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { AiPromptRegistry } from "./AiPromptRegistry.js";
import { ChatTaskType } from "@domain/entities/ChatMessage.js";

describe("AiPromptRegistry", () => {
  const registry = new AiPromptRegistry();

  it("returns a dedicated prompt for every task type", () => {
    const tasks = Object.values(ChatTaskType);
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      const prompt = registry.getSystemPrompt(task);
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(10);
    }
  });

  it("falls back to the general prompt for unknown tasks", () => {
    const prompt = registry.getSystemPrompt("unknown" as ChatTaskType);
    expect(prompt).toBe(registry.getSystemPrompt(ChatTaskType.GENERAL));
  });

  it("classify_signal instructs a single label response", () => {
    const prompt = registry.getSystemPrompt(ChatTaskType.CLASSIFY_SIGNAL);
    expect(prompt).toContain("BUY");
    expect(prompt).toContain("NO_ACTION");
  });
});
