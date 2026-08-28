import { describe, it, expect } from "vitest";
import { selectHeadlines, type HeadlineSource } from "./headlineSelection.js";

const mk = (url: string, title: string, publishedAt: string | null): HeadlineSource => ({
  url,
  source: "Finnhub",
  title,
  publishedAt: publishedAt ? new Date(publishedAt) : null,
});

describe("selectHeadlines", () => {
  it("dedups multi-tag articles by url", () => {
    const result = selectHeadlines(
      [
        [mk("a", "Article A", "2026-01-01")],
        [mk("a", "Article A", "2026-01-01")],
      ],
      10
    );
    expect(result).toHaveLength(1);
  });

  it("sorts by publishedAt DESC", () => {
    const result = selectHeadlines(
      [[
        mk("old", "Old", "2026-01-01"),
        mk("new", "New", "2026-02-01"),
      ]],
      10
    );
    expect(result.map((h) => h.title)).toEqual(["New", "Old"]);
  });

  it("keeps every tag represented by its latest", () => {
    const result = selectHeadlines(
      [
        [mk("usd1", "USD 1", "2026-02-01")],
        [mk("btc1", "BTC 1", "2026-01-15")],
      ],
      10
    );
    expect(result.map((h) => h.title)).toEqual(["USD 1", "BTC 1"]);
  });

  it("truncates to limit", () => {
    const result = selectHeadlines(
      [[
        mk("a", "A", "2026-01-01"),
        mk("b", "B", "2026-01-02"),
        mk("c", "C", "2026-01-03"),
      ]],
      2
    );
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("C");
  });

  it("handles null publishedAt as oldest", () => {
    const result = selectHeadlines(
      [[
        mk("no-date", "No date", null),
        mk("dated", "Dated", "2026-01-01"),
      ]],
      10
    );
    expect(result[0].title).toBe("Dated");
  });
});
