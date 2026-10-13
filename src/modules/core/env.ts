import { z } from 'zod';

/**
 * Validated environment. Fails fast at boot rather than at the first request.
 * No secret ever appears in source; everything arrives through the environment.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1),
  DATABASE_URL_SYSTEM: z.string().min(1).optional(),
  DATABASE_URL_OWNER: z.string().min(1).optional(),

  APP_URL: z.string().url().default('http://localhost:3000'),
  /** Origin baked into printed QR codes. Changing it invalidates printed QRs. */
  PUBLIC_QR_ORIGIN: z.string().url().default('http://localhost:3000'),

  SESSION_SECRET: z.string().min(16),
  ANALYTICS_SALT_SECRET: z.string().min(16),

  STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads-dev'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().optional(),
  /**
   * The driver is named 'r2' but speaks plain S3-compatible SigV4, so any
   * provider with that API works (Backblaze B2, Wasabi, MinIO...). Both
   * default to Cloudflare R2's own shape when unset, so existing R2 setups
   * need neither variable.
   */
  R2_ENDPOINT_HOST: z.string().optional(),
  R2_REGION: z.string().default('auto'),

  AI_PROVIDER: z.enum(['none', 'mock', 'gemini', 'groq', 'cloudflare']).default('none'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),

  SMS_DRIVER: z.enum(['console', 'msg91']).default('console'),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_SENDER_ID: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return env().NODE_ENV === 'production';
}
