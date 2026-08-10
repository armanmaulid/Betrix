import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import chalk from "chalk";
import { env } from "@config/env";

const { combine, timestamp, printf, errors, json, colorize } = winston.format;

function truncate(str: string, maxLen = 500): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + chalk.gray(`... [truncated ${str.length - maxLen} chars]`);
}

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

function formatStack(stack?: string): string {
  if (!stack) return "";
  const lines = stack.split("\n").slice(0, 10);
  return "\n" + lines.map(l => chalk.red(l)).join("\n");
}

const consoleFormatter = printf(({ level, message, timestamp, context, ...meta }) => {
  const appName = chalk.bold.green("[Betrix]");
  const pid = process.pid;
  
  const dateObj = new Date(timestamp as string);
  const dateStr = dateObj.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  const timeStr = dateObj.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  
  let levelStr = level.toUpperCase().padEnd(5);
  if (level === "info") levelStr = chalk.green(levelStr);
  else if (level === "error") levelStr = chalk.red(levelStr);
  else if (level === "warn") levelStr = chalk.yellow(levelStr);
  else if (level === "debug") levelStr = chalk.cyan(levelStr);
  else levelStr = chalk.magenta(levelStr);

  const contextStr = context ? chalk.yellow(`[${context}]`) : "";
  
  let finalMessage = message;
  const tagMatch = typeof message === "string" && message.match(/^(\[[^\]]+\])\s+(.*)/);
  if (tagMatch) {
    finalMessage = `${chalk.yellow(tagMatch[1])} ${chalk.green(tagMatch[2])}`;
  } else {
    finalMessage = chalk.white(message);
  }

  let msg = `${chalk.bold.green("[Betrix]")} ${chalk.gray(process.pid.toString().padStart(5))}  ${chalk.gray(`${dateStr}, ${timeStr}`)}  ${levelStr} ${contextStr} ${finalMessage}`;
  
  const keys = Object.keys(meta).filter(k => 
    !["level", "message", "timestamp", "context", "pid", "stack"].includes(k)
  );
  
  if (Object.keys(meta).length > 0) {
    const metaObj: Record<string, unknown> = {};
    for (const key of Object.keys(meta)) {
      if (!["level", "message", "timestamp", "context", "pid", "stack"].includes(key)) {
        meta[key as keyof typeof meta] = meta[key];
      }
    }
    
    if (Object.keys(meta).length > 0) {
      const metaStr = "\n" + JSON.stringify(meta, (_, v) => {
        if (typeof v === "string" && v.length > 1000) {
          return truncate(v, 200);
        }
        return v;
      }, 2);
      msg += chalk.gray(metaStr);
    }
  }

  if (meta.stack) {
    const lines = (meta.stack as string).split("\n").slice(0, 10);
    msg += "\n" + lines.map(l => chalk.red(l)).join("\n");
  }

  return msg;
});

const fileFormat = combine(
  timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
  errors({ stack: true }),
  json()
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
        colorize(),
        consoleFormatter
      ),
    }),
    new DailyRotateFile({
      filename: "logs/error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxFiles: "14d",
      maxSize: "20m",
      zippedArchive: true,
      format: combine(
        timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
        errors({ stack: true }),
        json()
      ),
    }),
    new DailyRotateFile({
      filename: "logs/combined-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "7d",
      maxSize: "20m",
      zippedArchive: true,
      format: combine(
        timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
        errors({ stack: true }),
        json()
      ),
    }),
  ],
});

export function logMetrics(data: Record<string, unknown>) {
  logger.info("AI Request", { context: "AI", ...data });
}

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

export function logResponse(req: { method: string; url: string }, res: { statusCode: number }, requestId: string, durationMs: number) {
  const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
  logger.log("info", "HTTP Response", {
    context: "HTTP",
    requestId,
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    durationMs,
  });
}

export function logError(context: string, error: Error, meta?: Record<string, unknown>) {
  logger.error(error.message, {
    context,
    stack: error.stack,
    ...meta,
  });
}