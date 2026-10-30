import { z } from 'zod';

const booleanFromEnv = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const optionalEmail = z.preprocess((value) => value === '' ? undefined : value, z.email().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DB_HOST: z.string().min(1, 'DB_HOST is required'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1, 'DB_NAME is required'),
  DB_USER: z.string().min(1, 'DB_USER is required'),
  DB_PASSWORD: z.string().min(1, 'DB_PASSWORD is required'),
  DB_SSL: booleanFromEnv,
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  GOOGLE_CLIENT_ID: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanFromEnv,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  BOOKING_NOTIFICATION_ADMIN_EMAIL: optionalEmail,
  SUPPORT_EMAIL: optionalEmail,
  SMTP_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),
  EMAIL_RETRY_INTERVAL_MS: z.coerce.number().int().min(10_000).max(3_600_000).default(60_000),

  HOTEL_PROVIDERS: z.string().default('openstreetmap,google_places,mock'),
  ALLOW_ILLUSTRATIVE_HOTEL_IMAGES: booleanFromEnv,
  OSM_USER_AGENT: z.string().default('GokaasaHotelOnboarding/0.1 (ops@gokaasa.com)'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  HOTEL_API_KEY: z.string().optional(),
  IMPORT_JOB_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),

  HOLD_DURATION_MINUTES: z.coerce.number().int().min(1).max(120).default(5),
  BUSINESS_TIMEZONE: z.string().default('Asia/Kolkata'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),

  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),

  // Hotel Partner Portal: self-service registration. Verification documents are stored outside the
  // publicly-served MEDIA_DIR on purpose -- see storage/privateStorage.js.
  PARTNER_DOCS_DIR: z.string().default('uploads-private'),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // AI-powered natural-language booking assistant (Mode B). All optional and unset by default: the
  // guided chatbot (Mode A) works fully without any of these. When AI_API_BASE_URL and AI_API_KEY are
  // both set, config.ai.enabled becomes true and an OpenAI-compatible chat-completions endpoint is used
  // (works with OpenAI itself, or any self-hosted/OpenAI-compatible gateway, including an Ollama
  // instance running its own OpenAI-compatible API surface) -- no provider-specific SDK dependency added.
  AI_PROVIDER: z.string().default('openai-compatible'),
  AI_MODEL: z.string().default('gpt-4o-mini'),
  AI_API_BASE_URL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(12_000),

  // Authenticated session presence (admin "who's online" dashboard). Online/offline is derived live from
  // last_heartbeat_at rather than written on timeout, so only the cleanup sweep interval causes writes.
  PRESENCE_HEARTBEAT_SECONDS: z.coerce.number().int().min(10).max(120).default(30),
  PRESENCE_ONLINE_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(600).default(90),
  PRESENCE_AWAY_TIMEOUT_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  PRESENCE_SESSION_EXPIRE_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  PRESENCE_CLEANUP_INTERVAL_MS: z.coerce.number().int().min(60_000).max(3_600_000).default(300_000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${details.join('\n')}`);
}

const env = parsed.data;

const smtpParts = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_PASS].filter(Boolean).length;
if (smtpParts > 0 && smtpParts < 3) {
  throw new Error('Invalid environment configuration:\nSMTP_HOST, SMTP_USER and SMTP_PASS must be configured together');
}

export const config = Object.freeze({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  trustProxy: env.TRUST_PROXY,
  frontendUrl: env.FRONTEND_URL,
  database: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    name: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: env.DB_SSL,
  },
  auth: {
    jwtSecret: env.JWT_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    passwordResetTtlMinutes: env.PASSWORD_RESET_TTL_MINUTES,
    bcryptRounds: env.BCRYPT_ROUNDS,
    googleClientId: env.GOOGLE_CLIENT_ID,
    refreshCookieName: 'gk_refresh',
  },
  mail: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM || env.MAIL_FROM || 'Gokaasa <noreply@mg.gokaasa.com>',
    bookingAdminEmail: env.BOOKING_NOTIFICATION_ADMIN_EMAIL || env.ADMIN_EMAIL || null,
    supportEmail: env.SUPPORT_EMAIL || null,
    connectionTimeoutMs: env.SMTP_CONNECTION_TIMEOUT_MS,
    retryIntervalMs: env.EMAIL_RETRY_INTERVAL_MS,
  },
  hotelImport: {
    providers: env.HOTEL_PROVIDERS.split(',').map((code) => code.trim()).filter(Boolean),
    osmUserAgent: env.OSM_USER_AGENT,
    googleMapsApiKey: env.GOOGLE_MAPS_API_KEY,
    concurrency: env.IMPORT_JOB_CONCURRENCY,
  },
  features: {
    // Hard-gated on NODE_ENV, not just the env var's own default: even a mistaken `true` in a
    // production .env can never let an illustrative-only hotel satisfy the publish gate.
    allowIllustrativeHotelImages: env.NODE_ENV !== 'production' && env.ALLOW_ILLUSTRATIVE_HOTEL_IMAGES,
  },
  seed: {
    adminEmail: env.ADMIN_EMAIL,
    adminPassword: env.ADMIN_PASSWORD,
  },
  partner: {
    docsDir: env.PARTNER_DOCS_DIR,
    otpTtlMinutes: env.OTP_TTL_MINUTES,
    otpMaxAttempts: env.OTP_MAX_ATTEMPTS,
  },
  booking: {
    holdDurationMinutes: env.HOLD_DURATION_MINUTES,
    businessTimezone: env.BUSINESS_TIMEZONE,
  },
  payments: {
    keyId: env.RAZORPAY_KEY_ID || null,
    keySecret: env.RAZORPAY_KEY_SECRET || null,
  },
  media: {
    maxUploadBytes: 5 * 1024 * 1024,
    maxImagesPerHotel: 30,
    maxImagesPerRoom: 15,
  },
  ai: {
    enabled: Boolean(env.AI_API_BASE_URL && env.AI_API_KEY),
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
    baseUrl: env.AI_API_BASE_URL || null,
    apiKey: env.AI_API_KEY || null,
    requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
  },
  presence: {
    heartbeatSeconds: env.PRESENCE_HEARTBEAT_SECONDS,
    onlineTimeoutSeconds: env.PRESENCE_ONLINE_TIMEOUT_SECONDS,
    awayTimeoutSeconds: env.PRESENCE_AWAY_TIMEOUT_SECONDS,
    sessionExpireMinutes: env.PRESENCE_SESSION_EXPIRE_MINUTES,
    cleanupIntervalMs: env.PRESENCE_CLEANUP_INTERVAL_MS,
  },
});
