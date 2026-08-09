export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INSUFFICIENT_CREDITS: "INSUFFICIENT_CREDITS",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

export const LIMITS = {
  MESSAGE_MAX_LENGTH: 8000,
  HISTORY_MAX_MESSAGES: 20,
  IMAGE_MAX_BYTES: 8 * 1024 * 1024,
  PASSWORD_MIN_LENGTH: 8,
  SESSION_TOKEN_BYTES: 32,
  VERIFICATION_TOKEN_BYTES: 32,
  OAUTH_STATE_BYTES: 16,
  OAUTH_STATE_TTL_SECONDS: 300,
} as const;

export const TASK_TYPES = [
  "general",
  "trade_reasoning",
  "risk_narrative",
  "market_insight",
  "quick_summary",
  "classify_signal",
] as const;

export const MODEL_TIERS = ["cheap", "balanced", "deep"] as const;

export const USER_STATUSES = ["active", "banned", "suspended"] as const;

export const GENDERS = ["male", "female", "other"] as const;