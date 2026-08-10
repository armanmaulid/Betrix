import { createHash } from "crypto";

export class Email {
  constructor(public readonly value: string) {
    if (!this.isValid(value)) {
      throw new Error("Invalid email format");
    }
    this.value = value.toLowerCase().trim();
  }

  private isValid(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

export class Password {
  constructor(public readonly hash: string) {}

  static fromPlaintext(plaintext: string): Password {
    // Hashing should be done in infrastructure layer
    return new Password(plaintext);
  }
}

export class DeviceFingerprint {
  constructor(public readonly value: string) {}

  static create(request: { ip?: string; headers: { "user-agent"?: string } }): DeviceFingerprint {
    const components = [
      request.ip || "unknown",
      request.headers["user-agent"] || "unknown"
    ];
    const raw = components.join("|");
    const hash = createHash("sha256").update(raw).digest("base64");
    return new DeviceFingerprint(hash);
  }

  equals(other: DeviceFingerprint): boolean {
    return this.value === other.value;
  }
}

export class SessionToken {
  constructor(public readonly value: string) {}

  static async generate(): Promise<SessionToken> {
    const { randomBytes } = await import("crypto");
    return new SessionToken(randomBytes(32).toString("hex"));
  }

  static async generateAsync(): Promise<SessionToken> {
    const { randomBytes } = await import("crypto");
    return new SessionToken(randomBytes(32).toString("hex"));
  }

  equals(other: SessionToken): boolean {
    return this.value === other.value;
  }
}