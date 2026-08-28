import { z } from "zod";

// zod v4 helper: split default + transform using .pipe() so default value type
// matches input (string) before being transformed to the output type
const stringToArray = (sep: string) =>
  z.string().transform(s => s.split(sep).map(i => i.trim()).filter(Boolean));

const csvToArray = (sep: string) =>
  z
    .string()
    .transform(s => s.split(sep).map(i => i.trim()).filter(Boolean));

// Same as csvToArray but with a default — chain: default(input) → transform → output
const csvToArrayWithDefault = (sep: string, defaultValue: string) =>
  z
    .string()
    .default(defaultValue)
    .transform(s => s.split(sep).map(i => i.trim()).filter(Boolean));

const stringToBoolean = (defaultStr: string) =>
  z
    .string()
    .default(defaultStr)
    .transform(s => s === "true")
    .pipe(z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  ALLOWED_ORIGINS: csvToArrayWithDefault(",", "http://localhost:5173,http://localhost:5174"),

  DATABASE_URL: z.string().url(),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  JWT_SECRET: z.string().min(32),
  DEVICE_ENFORCEMENT: z.string().default("false").transform(s => s === "true").pipe(z.boolean()),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),

  AI_BASE_URL: z.string().url(),
  AI_API_KEY: z.string().min(1),
  MODEL_CHEAP: z.string().min(1),
  MODEL_BALANCED: z.string().min(1),
  MODEL_DEEP: z.string().min(1),
  MODEL_CHEAP_MAX_TOKENS: z.coerce.number().default(2048),
  MODEL_BALANCED_MAX_TOKENS: z.coerce.number().default(4096),
  MODEL_DEEP_MAX_TOKENS: z.coerce.number().default(8192),

  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  SMTP_FROM: z.string().default("Betrix"),

  FINNHUB_API_KEY: z.string().optional(),
  MT5_BRIDGE_URL: z.string().default("127.0.0.1:8890"),
  MT5_WS_URL: z.string().optional(),
  MT5_HTTP_URL: z.string().optional(),
  FINNHUB_POLLING_INTERVAL_SEC: z.coerce.number().default(10),
  MT5_POLLING_INTERVAL_SEC: z.coerce.number().default(10),
  MT5_BROKER_UTC_OFFSET: z.coerce.number().default(3),
  MT5_TRACK_PRICES: stringToBoolean("true"),
  MT5_TRACK_OHLC: stringToBoolean("true"),
  MT5_TRACK_MBOOK: stringToBoolean("false"),
  MT5_TRACK_CALENDAR: stringToBoolean("true"),
  MT5_TRACKING_SYMBOLS: csvToArrayWithDefault(",", "EURUSD, GBPUSD, USDJPY, USDCAD, AUDUSD, NZDUSD, USDCHF, XAUUSD, XAGUSD, XTIUSD, BTCUSD, ETHUSD"),

  LOG_LEVEL: z.enum(["error", "warn", "info", "debug", "silent"]).default("info"),
  TRUST_PROXY_HOPS: z.coerce.number().default(1),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(30),
  RATE_LIMIT_PER_USER_PER_MINUTE: z.coerce.number().default(30),
  RATE_LIMIT_REGISTER_PER_HOUR: z.coerce.number().default(5),
  SESSION_LOOKUP_TIMEOUT_MS: z.coerce.number().default(5000),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().default(30000),
  AI_STREAM_TIMEOUT_MS: z.coerce.number().default(60000),
  SSE_HEARTBEAT_INTERVAL_MS: z.coerce.number().default(15000),
  DB_POOL_MAX: z.coerce.number().default(20),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().default(10000),
  DB_QUERY_TIMEOUT_MS: z.coerce.number().default(15000),
  SERVER_KEEPALIVE_TIMEOUT_MS: z.coerce.number().default(65000),
  SERVER_HEADERS_TIMEOUT_MS: z.coerce.number().default(66000),
  REQUIRE_EMAIL_VERIFICATION: stringToBoolean("false"),
  AI_DEBUG_LOGGING: stringToBoolean("false"),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;