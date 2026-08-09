import crypto from "crypto";
import { UAParser } from "ua-parser-js";
import { Request } from "express";

export function normalizeIP(ip: string): string {
  if (ip.startsWith("::ffff:")) {
    return ip.substring(7);
  }
  if (ip === "::1") {
    return "127.0.0.1";
  }
  return ip;
}

export function getDeviceFingerprint(req: Request): string {
  const parser = new UAParser(req.headers["user-agent"]);
  const ua = parser.getResult();

  const fingerprint = [
    normalizeIP(req.ip || "unknown"),
    ua.browser.name || "unknown",
    ua.browser.version?.split(".")[0] || "unknown",
    ua.os.name || "unknown",
    ua.device.type || "desktop",
  ].join("|");

  return crypto.createHash("sha256").update(fingerprint).digest("hex");
}