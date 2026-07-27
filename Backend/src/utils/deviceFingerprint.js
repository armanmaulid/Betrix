import crypto from "crypto";
import { UAParser } from "ua-parser-js";
import { normalizeIP } from "../middleware/normalizeIP.js";

export function getDeviceFingerprint(req) {
  const parser = new UAParser(req.headers["user-agent"]);
  const ua = parser.getResult();

  const fingerprint = [
    req.normalizedIP || normalizeIP(req.ip),
    ua.browser.name,
    ua.browser.version?.split(".")[0],
    ua.os.name,
    ua.device.type || "desktop",
  ].join("|");

  return crypto.createHash("sha256").update(fingerprint).digest("hex");
}
