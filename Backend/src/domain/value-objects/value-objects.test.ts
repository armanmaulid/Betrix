import { describe, it, expect } from "vitest";
import { Email, Password, DeviceFingerprint, SessionToken } from "./index.js";

describe("Email value object", () => {
  it("normalizes and validates a valid email", () => {
    const email = new Email("USER@Example.COM");
    expect(email.value).toBe("user@example.com");
  });

  it("rejects invalid email formats", () => {
    expect(() => new Email("not-an-email")).toThrow("Invalid email format");
    expect(() => new Email("missing@tld")).toThrow("Invalid email format");
    expect(() => new Email("has space@example.com")).toThrow("Invalid email format");
    expect(() => new Email("")).toThrow("Invalid email format");
    expect(() => new Email("  USER@Example.COM ")).toThrow("Invalid email format");
  });

  it("supports equality and string conversion", () => {
    const a = new Email("a@b.co");
    const b = new Email("A@B.CO");
    expect(a.equals(b)).toBe(true);
    expect(a.toString()).toBe("a@b.co");
  });
});

describe("Password value object", () => {
  it("stores a hash", () => {
    const p = new Password("hashed-value");
    expect(p.hash).toBe("hashed-value");
  });

  it("creates from plaintext", () => {
    const p = Password.fromPlaintext("secret");
    expect(p.hash).toBe("secret");
  });
});

describe("DeviceFingerprint value object", () => {
  it("produces a stable hash for the same request", () => {
    const req = { ip: "1.2.3.4", headers: { "user-agent": "Chrome/120" } };
    const a = DeviceFingerprint.create(req);
    const b = DeviceFingerprint.create(req);
    expect(a.value).toBeTruthy();
    expect(a.value).toBe(b.value);
    expect(a.equals(b)).toBe(true);
  });

  it("differs when IP or user-agent changes", () => {
    const base = { ip: "1.2.3.4", headers: { "user-agent": "Chrome/120" } };
    const a = DeviceFingerprint.create(base);
    const b = DeviceFingerprint.create({ ...base, ip: "5.6.7.8" });
    expect(a.value).not.toBe(b.value);
  });

  it("handles missing ip / user-agent", () => {
    const fp = DeviceFingerprint.create({ headers: {} });
    expect(fp.value).toBeTruthy();
  });
});

describe("SessionToken value object", () => {
  it("generates a 64-char hex token", async () => {
    const token = await SessionToken.generate();
    expect(token.value).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique tokens", async () => {
    const [a, b] = await Promise.all([SessionToken.generate(), SessionToken.generate()]);
    expect(a.value).not.toBe(b.value);
  });

  it("supports equality", async () => {
    const a = await SessionToken.generate();
    const b = new SessionToken(a.value);
    expect(a.equals(b)).toBe(true);
  });

  it("generateAsync produces a valid token too", async () => {
    const token = await SessionToken.generateAsync();
    expect(token.value).toMatch(/^[0-9a-f]{64}$/);
  });
});
