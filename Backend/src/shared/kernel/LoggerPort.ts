// src/shared/kernel/LoggerPort.ts
// Port interface untuk logging — domain & application layer depend on ini,
// BUKAN pada library pino/winston langsung.
// Adapter konkret ada di src/infrastructure/observability/logger/

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type LogContext = Record<string, unknown>;

export interface LoggerPort {
  trace(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  fatal(message: string, context?: LogContext): void;

  /**
   * Buat child logger dengan context tambahan yang selalu ada di setiap log.
   * Useful untuk attach module name, userId, requestId, dll.
   */
  child(bindings: LogContext): LoggerPort;
}
