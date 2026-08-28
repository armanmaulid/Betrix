// src/infrastructure/observability/logger.ts
// Adapter konkret untuk LoggerPort — pakai pino.
// Singleton instance + helper untuk child logger.

import pino, { Logger as PinoLogger } from 'pino';
import type { LoggerPort, LogContext, LogLevel } from '../../shared/kernel/LoggerPort.js';

const isDev = process.env.NODE_ENV !== 'production';

const baseLogger: PinoLogger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  base: {
    service: 'betrix-backend',
    env: process.env.NODE_ENV ?? 'development',
    pid: process.pid,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  // Pretty print di dev
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname,service,env',
          },
        },
      }
    : {}),
});

class PinoLoggerAdapter implements LoggerPort {
  constructor(private readonly logger: PinoLogger) {}

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (context && Object.keys(context).length > 0) {
      this.logger[level](context, message);
    } else {
      this.logger[level](message);
    }
  }

  trace(message: string, context?: LogContext): void {
    this.log('trace', message, context);
  }
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }
  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }
  fatal(message: string, context?: LogContext): void {
    this.log('fatal', message, context);
  }

  child(bindings: LogContext): LoggerPort {
    return new PinoLoggerAdapter(this.logger.child(bindings));
  }
}

export const logger: LoggerPort = new PinoLoggerAdapter(baseLogger);

// Re-export base pino untuk backward compat dengan code existing
export const pinoLogger = baseLogger;
export type { LoggerPort };
