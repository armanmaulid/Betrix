import chalk from "chalk";
import boxen from "boxen";
import figlet from "figlet";
import { pool } from "../db/pool.js";
import { logger } from "./logger.js";

export async function printStartupBanner({ port, startTime, env, packageInfo, cleanupSummary }) {
  // ── Bloomberg Terminal Color Palette ──
  const amber = chalk.hex('#FFB000');
  const cyan = chalk.hex('#00FFFF');
  const green = chalk.hex('#00FF00');

  // ── 1. Gather Service Statuses ──
  let dbStatus = amber("⚠ DATABASE_URL not set");
  if (process.env.DATABASE_URL) {
    try {
      const dbUrl = new URL(process.env.DATABASE_URL);
      await pool.query("SELECT 1");
      dbStatus = green(`✔ connected — ${dbUrl.hostname}:${dbUrl.port || 5432}`);
    } catch (err) {
      dbStatus = chalk.red(`✖ connection failed — ${err.message}`);
    }
  }

  let redisStatus = amber("⚠ UPSTASH_REDIS_REST_URL not set");
  if (process.env.UPSTASH_REDIS_REST_URL) {
    const redisHost = new URL(process.env.UPSTASH_REDIS_REST_URL).hostname;
    redisStatus = green(`✔ configured — ${redisHost}`);
  }

  let aiStatus = amber("⚠ AI_BASE_URL not set");
  if (process.env.AI_BASE_URL) {
    const aiHost = new URL(process.env.AI_BASE_URL).host;
    const hasKey = process.env.AI_API_KEY ? "key set" : "no key";
    aiStatus = green(`✔ ${aiHost} (${hasKey})`);
  }

  let smtpStatus = amber("⚠ SMTP_HOST not set");
  if (process.env.SMTP_HOST) {
    smtpStatus = green(`✔ ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}`);
  }

  let googleStatus = process.env.GOOGLE_CLIENT_ID ? green("✔ configured") : amber("⚠ GOOGLE_CLIENT_ID not set");

  // ── 2. ASCII Art Logo (Bloomberg Style) ──
  const logoText = figlet.textSync("BETRIX", { font: "ANSI Shadow" });

  // ── 3. Calculate Boot Time ──
  const bootTimeMs = Math.round(Date.now() - startTime);

  // ── 4. Build Professional Banner ──
  const startupMessage = `
${amber(logoText)}

${amber.bold(packageInfo.name || "Betrix Backend")} ${chalk.gray(`v${packageInfo.version || "0.1.0"}`)}

${green("➜")}  ${amber.bold("Local:")}   http://localhost:${port}
${green("➜")}  ${amber.bold("Env:")}     ${env}
${green("➜")}  ${amber.bold("PID:")}     ${process.pid}
${green("➜")}  ${amber.bold("Time:")}    ${bootTimeMs}ms

${cyan.bold("Services")}
  Database:     ${dbStatus}
  Redis:        ${redisStatus}
  AI Gateway:   ${aiStatus}
  SMTP:         ${smtpStatus}
  Google OAuth: ${googleStatus}

${cyan.bold("Security")}
  CORS:         ${process.env.ALLOWED_ORIGINS || "localhost defaults"}
  Rate Limits:  API=${Number(process.env.RATE_LIMIT_PER_MINUTE) || 30}/min, Auth=10/5min
  Device Enf.:  ${process.env.DEVICE_ENFORCEMENT === "false" ? amber("⚠ DISABLED") : green("✔ enabled")}

${cyan.bold("Startup Cleanup")}
  Cleaned:      ${cleanupSummary || "None"}

${cyan.bold("Scheduled Jobs")}
  Cleanup:      every 1h (sessions, attempts, tokens, usage, old news)
  News Feed:    every 5s (Finnhub REST)
  Heartbeat:    every 30s
`;

  // ── 5. Print Banner and Log ──
  console.log(
    boxen(startupMessage.trim(), {
      padding: 1,
      margin: 1,
      borderStyle: "double",
      borderColor: "yellow", // To match the amber vibe
    })
  );

  logger.info(`Server ready on port ${port} (Boot time: ${bootTimeMs}ms)`, { context: "NestApplication" });
}
