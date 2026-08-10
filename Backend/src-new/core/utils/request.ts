export interface RequestInput {
  ip: string;
  userAgent: string;
}

export interface AuthenticatedRequestInput extends RequestInput {
  userId: string;
  sessionToken: string;
}

export function createRequestInput(req: { ip: string; headers: { "user-agent"?: string } }): RequestInput {
  return {
    ip: req.ip,
    userAgent: req.headers["user-agent"] ?? "",
  };
}

export function createAuthenticatedRequestInput(
  req: { ip: string; headers: { "user-agent"?: string } },
  userId: string,
  sessionToken: string
): AuthenticatedRequestInput {
  return {
    ip: req.ip,
    userAgent: req.headers["user-agent"] ?? "",
    userId,
    sessionToken,
  };
}