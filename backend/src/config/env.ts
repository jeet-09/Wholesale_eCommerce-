import { z } from 'zod';

/**
 * Environment configuration — validated at startup (fail fast).
 * The process refuses to boot if any required variable is missing/malformed
 * (README → Secrets & Configuration; TECHNICAL-DETAILS.MD §10).
 */

/**
 * Trim whitespace and treat blank values as "unset". This makes optional vars
 * resilient to how different loaders (dotenv vs Docker Compose `env_file`) handle
 * empty values and inline comments — a blank/whitespace value becomes undefined.
 */
const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(blankToUndefined, z.string().trim().optional());
const optionalUrl = z.preprocess(blankToUndefined, z.string().trim().url().optional());

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().min(1).default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1).default('30d'),

  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),
  COOKIE_DOMAIN: optionalString,

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.string().min(1).default('1 minute'),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),

  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  AWS_REGION: optionalString,
  AWS_S3_BUCKET: optionalString,
  AWS_ACCESS_KEY_ID: optionalString,
  AWS_SECRET_ACCESS_KEY: optionalString,
  S3_PUBLIC_BASE_URL: optionalUrl,
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/**
 * Parse and cache environment variables. Throws a readable error and exits
 * the process when validation fails — we never run with bad configuration.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    // Intentional stderr write: the logger is not yet available at boot.
    process.stderr.write(`\nInvalid environment configuration:\n${issues}\n\n`);
    throw new Error('Environment validation failed. See messages above.');
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function isProduction(env: Env): boolean {
  return env.NODE_ENV === 'production';
}

export function isTest(env: Env): boolean {
  return env.NODE_ENV === 'test';
}
