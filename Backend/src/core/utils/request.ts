export interface RequestInput {
  ip: string;
  userAgent: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface AuthenticatedRequestInput extends RequestInput {
  userId: string;
  sessionToken: string;
}

interface RequestLike {
  ip?: string;
  normalizedIP?: string;
  headers: Record<string, string | string[] | undefined>;
}

// Pakai req.normalizedIP (hasil middleware ipNormalizer: ::1 → 127.0.0.1,
// ::ffff:x → x) bila tersedia; fallback ke req.ip mentah.
function resolveIP(req: RequestLike): string {
  return req.normalizedIP || req.ip || "";
}

export function createRequestInput(req: RequestLike): RequestInput {
  return {
    ip: resolveIP(req),
    userAgent: (req.headers["user-agent"] as string) ?? "",
    headers: req.headers,
  };
}

export function createAuthenticatedRequestInput(
  req: RequestLike,
  userId: string,
  sessionToken: string
): AuthenticatedRequestInput {
  return {
    ip: resolveIP(req),
    userAgent: (req.headers["user-agent"] as string) ?? "",
    headers: req.headers,
    userId,
    sessionToken,
  };
}