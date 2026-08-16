import { describe, it, expect } from "vitest";
import { User, UserStatus } from "./User.js";

function baseUser(): User {
  return User.create({
    id: "u1",
    email: "Test@Example.com",
    passwordHash: "$2a$10$abc",
    name: "Test User",
    emailVerified: false,
  });
}

describe("User entity", () => {
  it("create normalizes email and sets defaults", () => {
    const user = baseUser();
    expect(user.email).toBe("test@example.com");
    expect(user.isAdmin).toBe(false);
    expect(user.status).toBe(UserStatus.ACTIVE);
    expect(user.emailVerified).toBe(false);
    expect(user.googleId).toBeNull();
  });

  it("with* methods are immutable — original instance is not mutated", () => {
    const user = baseUser();
    const updated = user.withGoogleId("g123").withEmailVerified().withPasswordHash(null);

    // Instance asli tidak berubah
    expect(user.googleId).toBeNull();
    expect(user.emailVerified).toBe(false);
    expect(user.passwordHash).toBe("$2a$10$abc");

    // Instance baru punya nilai baru
    expect(updated.googleId).toBe("g123");
    expect(updated.emailVerified).toBe(true);
    expect(updated.verifiedAt).toBeInstanceOf(Date);
    expect(updated.passwordHash).toBeNull();
  });

  it("reclaim chain (BUG-10): verified + password invalidated + googleId linked", () => {
    const preRegistered = baseUser(); // akun password yang belum verified
    const reclaimed = preRegistered
      .withEmailVerified()
      .withPasswordHash(null)
      .withGoogleId("google-456");

    expect(reclaimed.emailVerified).toBe(true);
    expect(reclaimed.passwordHash).toBeNull(); // password lama di-invalidasi
    expect(reclaimed.googleId).toBe("google-456"); // follow-up: googleId ikut ter-set
    expect(preRegistered.emailVerified).toBe(false); // asli tidak berubah
  });

  it("withGoogleId can clear the link back to null", () => {
    const user = baseUser().withGoogleId("g123");
    const cleared = user.withGoogleId(null);
    expect(cleared.googleId).toBeNull();
    expect(user.googleId).toBe("g123");
  });

  it("withStatus / canLogin reflect status changes", () => {
    const banned = baseUser().withStatus(UserStatus.BANNED);
    expect(banned.status).toBe(UserStatus.BANNED);
    expect(banned.canLogin()).toBe(false);
    expect(baseUser().canLogin()).toBe(true);
  });
});
