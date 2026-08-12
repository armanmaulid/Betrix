export interface RequestInput {
  ip: string;
  userAgent: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface AuthenticatedRequestInput extends RequestInput {
  userId: string;
  sessionToken: string;
}

export function createRequestInput(req: { ip: string; headers: Record<string, string | string[] | undefined> }): RequestInput {
  return {
    ip: req.ip,
    userAgent: (req.headers["user-agent"] as string) ?? "",
    headers: req.headers,
  };
}

export function createAuthenticatedRequestInput(
  req: { ip: string; headers: Record<string, string | string[] | undefined> },
  userId: string,
  sessionToken: string
): AuthenticatedRequestInput {
  return {
    ip: req.ip,
    userAgent: (req.headers["user-agent"] as string) ?? "",
    headers: req.headers,
    userId,
    sessionToken,
  };
}