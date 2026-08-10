import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import chalk from "chalk";
import { env } from "@config/env";

const { combine, timestamp, printf, errors, json, colorize } = winston.format;

// Truncate long strings (like HTML error pages)
function truncate(str: string, maxLen = 500): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + chalk.gray(`... [truncated ${str.length - maxLen} chars]`);
}

// Pretty print objects for console
function prettyPrint(obj: unknown, indent = 2): string {
  try {
    return JSON.stringify(obj, (_, v) => {
      if (typeof v === "string" && v.length > 1000) {
        return truncate(v, 200);
      }
      return v;
    }, indent);
  } catch {
    return String(obj);
  }
}

// Format metadata for console
function formatMeta(meta: Record<string, unknown>): string {
  const keys = Object.keys(meta).filter(k => 
    !["level", "message", "timestamp", "context", "pid", "stack"].includes(k)
  );
  
  if (keys.length === 0) return "";
  
  const metaObj: Record<string, unknown> = {};
  for (const key of keys) {
    metaObj[key] = meta[key];
  }
  return "\n" + prettyPrint(metaObj, 2);
}

// Format stack trace
function formatStack(stack?: string): string {
  if (!stack) return "";
  const lines = stack.split("\n").slice(0, 10);
  return "\n" + chalk.red(lines.join("\n"));
}

// Console format with colors and structure
const consoleFormat = printf(({ level, message, timestamp, context, pid, ...meta }) => {
  const appName = chalk.bold.green("[Betrix]");
  const pid = process.pid;
  
  const dateObj = new Date(timestamp as string);
  const dateStr = dateObj.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  const timeStr = dateObj.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  
  // Colorize level
  let levelStr = level.toUpperCase().padEnd(5);
  if (level === "info") levelStr = chalk.green(levelStr);
  else if (level === "error") levelStr = chalk.red(levelStr);
  else if (level === "warn") levelStr = chalk.yellow(levelStr);
  else if (level === "debug") levelStr = chalk.cyan(levelStr);
  else levelStr = chalk.magenta(levelStr);

  const contextStr = context ? chalk.yellow(`[${context}]`) : "";
  
  // Handle message formatting
  let finalMessage = message;
  const tagMatch = typeof message === "string" && message.match(/^(\[[^\]]+\])\s+(.*)/);
  if (tagMatch) {
    finalMessage = `${chalk.yellow(tagMatch[1])} ${chalk.green(tagMatch[2])}`;
  } else {
    finalMessage = chalk.white(message);
  }

  // Build main line
  let msg = `${appName} ${chalk.gray(pid.toString().padStart(5))}  ${chalk.gray(`${dateStr} ${timeStr}`)}  ${levelStr} ${contextStr} ${finalMessage}`;
  
  // Add meta if present
  const metaStr = formatMeta(meta);
  if (metaStr) {
    msg += chalk.gray(metaStr);
  }

  // Add stack trace if error
  if (meta.stack) {
    msg += formatStack(meta.stack as string);
  }

  return msg;
});

// JSON format for file logs
const fileFormat = combine(
  timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
  errors({ stack: true }),
  json()
);

// Console format with colors
const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
  consoleFormat
);

export const logger = winston.createLogger({
  level: env.LOG_LEVEL || "info",
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
    errors({ stack: true }),
    json()
  ),
  defaultMeta: { pid: process.pid },
  transports: [
    new winston.transports.Console({
      format: combine(
        timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
        consoleFormat
      ),
    }),
    new DailyRotateFile({
      filename: "logs/error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxFiles: "14d",
      maxSize: "20m",
      zippedArchive: true,
      format: fileFormat,
    }),
    new DailyRotateFile({
      filename: "logs/combined-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "7d",
      maxSize: "20m",
      zippedArchive: true,
      format: fileFormat,
    }),
  ],
});

// Helper for structured logging
export function logMetrics(data: Record<string, unknown>) {
  logger.info("AI Request", { context: "AI", ...data });
}

// Request logging helper
export function logRequest(req: { method: string; url: string; ip?: string; headers: Record<string, string> }, requestId: string) {
  logger.debug("HTTP Request", {
    context: "HTTP",
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });
}

// Response logging helper
export function logResponse(req: { method: string; url: string }, res: { statusCode: number }, requestId: string, durationMs: number) {
  const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
  logger.log(level, "HTTP Response", {
    context: "HTTP",
    requestId,
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    durationMs,
  });
}

// Error logging helper with truncation
export function logError(context: string, error: Error, meta?: Record<string, unknown>) {
  logger.error(error.message, {
    context,
    stack: error.stack,
    ...meta,
  });
}