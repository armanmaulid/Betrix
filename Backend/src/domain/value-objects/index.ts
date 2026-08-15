import { createHash } from "crypto";
import { UAParser } from "ua-parser-js";

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

  /**
   * Satu-satunya sumber fingerprint device di seluruh aplikasi.
   *
   * Menerima bentuk request apapun yang memiliki `ip` dan `headers`
   * (RequestInput dari core, request controller, atau test). Komponen yang
   * di-hash: IP ternormalisasi + browser (nama & major version) + OS +
   * tipe device — diurai dari user-agent. Ini lebih stabil daripada hash
   * user-agent mentah (perubahan minor version / header casing tidak
   * mengubah fingerprint).
   */
  static create(request: { ip?: string; headers: { "user-agent"?: string } }): DeviceFingerprint {
    const ua = new UAParser(request.headers["user-agent"] || "unknown").getResult();
    const components = [
      normalizeIP(request.ip || "unknown"),
      ua.browser.name || "unknown",
      ua.browser.version?.split(".")[0] || "unknown",
      ua.os.name || "unknown",
      ua.device.type || "desktop",
    ];
    const hash = createHash("sha256").update(components.join("|")).digest("hex");
    return new DeviceFingerprint(hash);
  }

  equals(other: DeviceFingerprint): boolean {
    return this.value === other.value;
  }
}

function normalizeIP(ip: string): string {
  if (ip.startsWith("::ffff:")) {
    return ip.substring(7);
  }
  if (ip === "::1") {
    return "127.0.0.1";
  }
  return ip;
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