import type { Request, Response, NextFunction } from "express";

export function ipNormalizer(req: Request, res: Response, next: NextFunction) {
  let ip = req.ip || "unknown";

  // Convert IPv6 loopback to IPv4 loopback
  if (ip === "::1") {
    ip = "127.0.0.1";
  } else if (ip.startsWith("::ffff:")) {
    // Strip IPv4-mapped IPv6 prefix (e.g. ::ffff:192.168.1.1 -> 192.168.1.1)
    ip = ip.substring(7);
  }

  (req as any).normalizedIP = ip;
  next();
}
