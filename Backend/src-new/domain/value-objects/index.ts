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

  equals(other: DeviceFingerprint): boolean {
    return this.value === other.value;
  }
}

export class SessionToken {
  constructor(public readonly value: string) {}

  static generate(): SessionToken {
    const crypto = require("crypto");
    return new SessionToken(crypto.randomBytes(32).toString("hex"));
  }

  static async generateAsync(): Promise<SessionToken> {
    const crypto = await import("crypto");
    return new SessionToken(crypto.randomBytes(32).toString("hex"));
  }

  equals(other: SessionToken): boolean {
    return this.value === other.value;
  }
}