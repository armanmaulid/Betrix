import { describe, it, expect, vi } from "vitest";
import { stripThinkingTags, createThinkingStreamFilter } from "./thinkingFilter.js";

describe("stripThinkingTags", () => {
  it("removes complete thinking blocks", () => {
    expect(stripThinkingTags("Hello <thinking>internal</thinking> World")).toBe("Hello  World");
  });

  it("removes an unclosed trailing thinking block", () => {
    expect(stripThinkingTags("Done <thinking>still thinking")).toBe("Done");
  });

  it("is case-insensitive", () => {
    expect(stripThinkingTags("A <THINKING>x</THINKING> B")).toBe("A  B");
  });

  it("handles text without tags unchanged", () => {
    expect(stripThinkingTags("Plain output")).toBe("Plain output");
  });

  it("trims surrounding whitespace", () => {
    expect(stripThinkingTags("  <thinking>x</thinking>result  ")).toBe("result");
  });
});

describe("createThinkingStreamFilter", () => {
  it("filters thinking tags split across chunks", () => {
    const onClean = vi.fn();
    const filter = createThinkingStreamFilter(onClean);

    filter.feed("out<thi");
    filter.feed("nking>secret");
    filter.feed("</thi");
    filter.feed("nking>done");
    filter.flush();

    expect(onClean).toHaveBeenCalled();
    const full = onClean.mock.calls.map((c) => c[0]).join("");
    expect(full).toBe("outdone");
  });

  it("emits clean text in order without thinking content", () => {
    const onClean = vi.fn();
    const filter = createThinkingStreamFilter(onClean);

    filter.feed("A<thinking>hidden</thinking>B");
    filter.flush();

    expect(onClean.mock.calls.map((c) => c[0]).join("")).toBe("AB");
  });

  it("drops an unclosed thinking block on flush", () => {
    const onClean = vi.fn();
    const filter = createThinkingStreamFilter(onClean);

    filter.feed("ok<thinking>never closed");
    filter.flush();

    expect(onClean.mock.calls.map((c) => c[0]).join("")).toBe("ok");
  });
});
