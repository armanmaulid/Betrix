// src/shared/errors/AppError.ts
// Base error class untuk semua domain/application error.
// Boleh di-extend untuk specific error type (NotFound, Validation, dll).
// Error handler di presentation layer akan translate ini ke HTTP response.

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INFRA_ERROR'
  | 'INTERNAL_ERROR';

export interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  statusCode?: number;
  cause?: unknown;
  context?: Record<string, unknown>;
  retryable?: boolean;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly cause?: unknown;
  public readonly context?: Record<string, unknown>;
  public readonly retryable: boolean;
  public readonly timestamp: string;

  constructor(opts: AppErrorOptions) {
    super(opts.message);
    this.name = this.constructor.name;
    this.code = opts.code;
    this.statusCode = opts.statusCode ?? 500;
    this.cause = opts.cause;
    this.context = opts.context;
    this.retryable = opts.retryable ?? false;
    this.timestamp = new Date().toISOString();

    // Maintain proper stack trace di V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      context: this.context,
      timestamp: this.timestamp,
    };
  }
}

// === Specific error types ===

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super({ code: 'VALIDATION_ERROR', message, statusCode: 400, context });
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super({
      code: 'NOT_FOUND',
      message: `${resource}${id ? ` with id ${id}` : ''} not found`,
      statusCode: 404,
      context: { resource, id },
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super({ code: 'UNAUTHORIZED', message, statusCode: 401 });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super({ code: 'FORBIDDEN', message, statusCode: 403 });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super({ code: 'CONFLICT', message, statusCode: 409, context });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super({ code: 'RATE_LIMITED', message, statusCode: 429, retryable: true });
  }
}

export class InfraError extends AppError {
  constructor(message: string, cause?: unknown, context?: Record<string, unknown>) {
    super({
      code: 'INFRA_ERROR',
      message,
      statusCode: 503,
      cause,
      context,
      retryable: true,
    });
  }
}
