import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { TradeAnalysisPromptBuilder } from "./TradeAnalysisPromptBuilder.js";

const builder = new TradeAnalysisPromptBuilder();

const makeCandles = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    time: 1_700_000_000 + i * 60,
    open: 100 + i,
    high: 102 + i,
    low: 98 + i,
    close: 101 + i,
  }));

describe("TradeAnalysisPromptBuilder.buildTradeContext", () => {
  it("returns [DATA PASAR TIDAK TERSEDIA] on empty candles", () => {
    const out = builder.buildTradeContext({ symbol: "XAUUSD", timeframe: "M15", candles: [] });
    expect(out).toContain("[DATA PASAR TIDAK TERSEDIA]");
    expect(out).toContain("JANGAN mengarang harga");
    // User request di-append oleh use case, bukan builder (hindari duplikasi).
    expect(out).not.toContain("[PERMINTAAN USER]");
  });

  it("builds realtime market block with instruction (no user text)", () => {
    const out = builder.buildTradeContext({ symbol: "XAUUSD", timeframe: "M15", candles: makeCandles(30) });
    expect(out).toContain("[DATA PASAR REALTIME - MT5]");
    expect(out).toContain("Symbol: XAUUSD | Timeframe: M15");
    expect(out).toContain("[INSTRUKSI FORMAT JAWABAN]");
    expect(out).toContain("Entry");
    expect(out).toContain("TP1");
    expect(out).not.toContain("[PERMINTAAN USER]");
  });

  it("caps detail candles to last 20", () => {
    const out = builder.buildTradeContext({ symbol: "XAUUSD", timeframe: "M15", candles: makeCandles(100) });
    const candleLines = out.split("\n").filter((l) => / O:/.test(l));
    expect(candleLines).toHaveLength(20);
  });
});

describe("TradeAnalysisPromptBuilder.buildNewsContext", () => {
  it("returns empty string for no items", () => {
    expect(builder.buildNewsContext([])).toBe("");
  });

  it("formats up to 5 headlines as [BERITA TERBARU]", () => {
    const out = builder.buildNewsContext(
      Array.from({ length: 6 }, (_, i) => ({ source: `src${i}`, title: `title ${i}` }))
    );
    expect(out).toContain("[BERITA TERBARU]");
    expect(out.split("\n").filter((l) => l.startsWith("- [")).length).toBe(5);
    expect(out).not.toContain("title 5");
  });
});
