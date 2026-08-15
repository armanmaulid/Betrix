import { describe, it, expect } from "vitest";
import { ModelPolicy } from "./ModelPolicy.js";

const models = {
  cheap: { id: "gpt-4o-mini", label: "Fast", maxTokens: 4000 },
  balanced: { id: "gpt-4o", label: "Balanced", maxTokens: 8000 },
  deep: { id: "gpt-4.1", label: "Deep", maxTokens: 16000 },
};

describe("ModelPolicy", () => {
  it("maps every task type to a tier", () => {
    const policy = new ModelPolicy(models);
    expect(policy.resolveTier("general")).toBe("cheap");
    expect(policy.resolveTier("classify_signal")).toBe("cheap");
    expect(policy.resolveTier("quick_summary")).toBe("balanced");
    expect(policy.resolveTier("market_insight")).toBe("balanced");
    expect(policy.resolveTier("trade_reasoning")).toBe("deep");
    expect(policy.resolveTier("risk_narrative")).toBe("deep");
  });

  it("falls back to balanced for unknown task types", () => {
    const policy = new ModelPolicy(models);
    expect(policy.resolveTier("unknown_task")).toBe("balanced");
  });

  it("honors a valid tier override", () => {
    const policy = new ModelPolicy(models);
    expect(policy.resolveTier("general", "deep")).toBe("deep");
    expect(policy.resolveTier("trade_reasoning", "cheap")).toBe("cheap");
  });

  it("ignores an invalid tier override", () => {
    const policy = new ModelPolicy(models);
    expect(policy.resolveTier("general", "ultra")).toBe("cheap");
  });

  it("resolves the concrete model definition", () => {
    const policy = new ModelPolicy(models);
    const model = policy.resolveModel("trade_reasoning");
    expect(model).toEqual(models.deep);
  });

  it("computes credit costs per tier", () => {
    const policy = new ModelPolicy(models);
    expect(policy.creditCost("cheap")).toBe(1);
    expect(policy.creditCost("balanced")).toBe(3);
    expect(policy.creditCost("deep")).toBe(5);
  });
});
