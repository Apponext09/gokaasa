import { z } from 'zod';

const booleanFromEnv = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: booleanFromEnv,
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Gokaasa <no-reply@gokaasa.com>'),

  HOTEL_PROVIDERS: z.string().default('openstreetmap,google_places,mock'),
  OSM_USER_AGENT: z.string().default('GokaasaHotelOnboarding/0.1 (ops@gokaasa.com)'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  HOTEL_API_KEY: z.string().optional(),
  IMPORT_JOB_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),

  HOLD_DURATION_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
  BUSINESS_TIMEZONE: z.string().default('Asia/Kolkata'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${details.join('\n')}`);
}

const env = parsed.data;

export const config = Object.freeze({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  trustProxy: env.TRUST_PROXY,
  frontendUrl: env.FRONTEND_URL,
  database: {
    url: env.DATABASE_URL,
    ssl: env.DATABASE_SSL,
  },
  auth: {
    jwtSecret: env.JWT_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    passwordResetTtlMinutes: env.PASSWORD_RESET_TTL_MINUTES,
    bcryptRounds: env.BCRYPT_ROUNDS,
    refreshCookieName: 'gk_refresh',
  },
  mail: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.MAIL_FROM,
  },
  hotelImport: {
    providers: env.HOTEL_PROVIDERS.split(',').map((code) => code.trim()).filter(Boolean),
    osmUserAgent: env.OSM_USER_AGENT,
    googleMapsApiKey: env.GOOGLE_MAPS_API_KEY,
    concurrency: env.IMPORT_JOB_CONCURRENCY,
  },
  seed: {
    adminEmail: env.ADMIN_EMAIL,
    adminPassword: env.ADMIN_PASSWORD,
  },
  booking: {
    holdDurationMinutes: env.HOLD_DURATION_MINUTES,
    businessTimezone: env.BUSINESS_TIMEZONE,
  },
  payments: {
    keyId: env.RAZORPAY_KEY_ID || null,
    keySecret: env.RAZORPAY_KEY_SECRET || null,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || null,
  },
  media: {
    maxUploadBytes: 5 * 1024 * 1024,
    maxImagesPerHotel: 30,
    maxImagesPerRoom: 15,
  },
});
