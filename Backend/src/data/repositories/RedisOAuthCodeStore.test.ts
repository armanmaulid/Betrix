import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedisOAuthCodeStore } from "./RedisOAuthCodeStore.js";
import { redisClient } from "../orm/redisClient.js";
import type { OAuthCodePayload } from "@domain/repositories/OAuthCodeStore.js";

vi.mock("../orm/redisClient.js", () => ({
  redisClient: {
    setex: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  },
}));

const payload: OAuthCodePayload = { sessionToken: "tok-123", userId: "u-1" };

describe("RedisOAuthCodeStore", () => {
  let store: RedisOAuthCodeStore;

  beforeEach(() => {
    store = new RedisOAuthCodeStore();
    vi.clearAllMocks();
  });

  it("save menulis JSON string ke redis dengan key oauth_code:<code> + TTL", async () => {
    await store.save("code-abc", payload, 300);

    expect(redisClient.setex).toHaveBeenCalledWith(
      "oauth_code:code-abc",
      300,
      JSON.stringify(payload)
    );
  });

  it("getAndDelete mengembalikan payload saat redis mengembalikan object (auto-parse Upstash)", async () => {
    // Upstash REST client auto-parses JSON (automaticDeserialization default true),
    // jadi nilai get() bisa sudah berupa object — regresi bug 400
    // "Invalid or expired OAuth code" (JSON.parse(object) throw → null).
    vi.mocked(redisClient.get).mockResolvedValue({ ...payload });

    const result = await store.getAndDelete("code-abc");

    expect(result).toEqual(payload);
    expect(redisClient.del).toHaveBeenCalledWith("oauth_code:code-abc");
  });

  it("getAndDelete mengembalikan payload saat redis mengembalikan string JSON (client tanpa auto-parse)", async () => {
    vi.mocked(redisClient.get).mockResolvedValue(JSON.stringify(payload));

    const result = await store.getAndDelete("code-abc");

    expect(result).toEqual(payload);
    expect(redisClient.del).toHaveBeenCalledWith("oauth_code:code-abc");
  });

  it("getAndDelete mengembalikan null saat kode tidak ditemukan", async () => {
    vi.mocked(redisClient.get).mockResolvedValue(null);

    const result = await store.getAndDelete("missing");

    expect(result).toBeNull();
    expect(redisClient.del).not.toHaveBeenCalled();
  });

  it("getAndDelete mengembalikan null saat nilai tidak bisa di-decode", async () => {
    vi.mocked(redisClient.get).mockResolvedValue("not-json{{");

    const result = await store.getAndDelete("code-abc");

    expect(result).toBeNull();
  });
});
