import { describe, it, expect } from "vitest";
import { tagNewsArticle } from "./newsTagging.js";

const base = {
  headline: "Market update",
  summary: "Daily briefing",
  source: "Finnhub",
};

describe("tagNewsArticle", () => {
  it("tags crypto keywords with btc", () => {
    const tags = tagNewsArticle({ ...base, headline: "Bitcoin breaks resistance above $70k" }, "general");
    expect(tags).toContain("btc");
  });

  it("tags usd keywords", () => {
    const tags = tagNewsArticle({ ...base, headline: "Fed holds rates, dollar steadies" }, "general");
    expect(tags).toContain("usd");
  });

  it("tags currency keywords (eur, gbp, jpy)", () => {
    expect(tagNewsArticle({ ...base, headline: "ECB cut lifts euro" }, "general")).toContain("eur");
    expect(tagNewsArticle({ ...base, headline: "Bank of England raises rates" }, "general")).toContain("gbp");
    expect(tagNewsArticle({ ...base, headline: "Yen weakens after BoJ decision" }, "general")).toContain("jpy");
  });

  it("tags commodity keywords (metal, oil)", () => {
    expect(tagNewsArticle({ ...base, headline: "Gold hits record high" }, "general")).toContain("metal");
    expect(tagNewsArticle({ ...base, headline: "Crude oil plunges on supply news" }, "general")).toContain("oil");
  });

  it("matches keywords in the summary too", () => {
    const tags = tagNewsArticle({ ...base, headline: "Morning report", summary: "ECB and eurozone outlook" }, "general");
    expect(tags).toContain("eur");
  });

  // Kategori/sumber crypto selalu menambah "btc" di branch pertama
  // (fallback "crypto" yang tak pernah reachable telah dihapus).
  it("crypto category yields btc even without keywords", () => {
    const tags = tagNewsArticle({ ...base, headline: "Weekly roundup" }, "crypto");
    expect(tags).toEqual(["btc"]);
  });

  it("crypto source yields btc even without keywords", () => {
    const tags = tagNewsArticle({ ...base, source: "CryptoNews", headline: "Weekly roundup" }, "general");
    expect(tags).toEqual(["btc"]);
  });

  it("falls back to eco for the forex category", () => {
    const tags = tagNewsArticle({ ...base, headline: "Weekly roundup" }, "forex");
    expect(tags).toEqual(["eco"]);
  });

  it("falls back to global otherwise", () => {
    const tags = tagNewsArticle(base, "general");
    expect(tags).toEqual(["global"]);
  });

  it("returns a stable, deduplicated tag list", () => {
    const tags = tagNewsArticle({ ...base, headline: "Bitcoin and ethereum rally on crypto news" }, "crypto");
    expect(tags.filter((t) => t === "btc")).toHaveLength(1);
  });
});
