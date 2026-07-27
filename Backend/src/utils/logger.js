import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import chalk from "chalk";

const { combine, timestamp, printf, errors, json } = winston.format;

// NestJS-like format
const consoleFormat = printf(({ level, message, timestamp, context, ...meta }) => {
  const pid = process.pid;
  const appName = chalk.green("[Betrix]");
  
  // Format date like 07/26/2026, 8:39:48 PM
  const dateObj = new Date(timestamp);
  const dateStr = dateObj.toLocaleDateString("en-US", { month: '2-digit', day: '2-digit', year: 'numeric' });
  const timeStr = dateObj.toLocaleTimeString("en-US");
  
  let levelStr = level.toUpperCase();
  if (level === 'info') levelStr = chalk.green(levelStr);
  else if (level === 'error') levelStr = chalk.red(levelStr);
  else if (level === 'warn') levelStr = chalk.yellow(levelStr);
  else levelStr = chalk.cyan(levelStr);

  const contextStr = context ? chalk.yellow(`[${context}] `) : "";
  
  let msg = `${appName} ${pid}  - ${dateStr}, ${timeStr}     ${levelStr} ${contextStr}${chalk.green(message)}`;
  
  if (meta.stack) {
    msg += `\n${chalk.red(meta.stack)}`;
  }
  return msg;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(
    timestamp(),
    errors({ stack: true }),
    json()
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        timestamp(),
        consoleFormat
      ),
    }),
    new DailyRotateFile({
      filename: "logs/error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxFiles: "14d",
      maxSize: "20m",
      zippedArchive: true
    }),
    new DailyRotateFile({
      filename: "logs/combined-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "7d",
      maxSize: "20m",
      zippedArchive: true
    }),
  ],
});

export function logMetrics(data) {
  logger.info("metrics", data);
}
