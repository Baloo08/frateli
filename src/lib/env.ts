import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/frateli?sslmode=disable"),
  PG_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  REDIS_URL: z.string().optional(),
  REDIS_QUEUE_URL: z.string().optional(),
  REDIS_CACHE_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(16).default("dev-session-secret-change-in-production-64-chars"),
  INTEGRATION_ENCRYPTION_KEY: z.string().optional(),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./.local-media"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default("frateli-media"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_APP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default("Frateli Campus <notifications@frateli.edu>"),
  SMTP_DAILY_LIMIT: z.coerce.number().int().default(450),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().optional(),
  BOOTSTRAP_ADMIN_EMAIL: z.string().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
  BOOTSTRAP_ADMIN_NAME: z.string().default("Superadmin Frateli"),
  FFMPEG_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  FFMPEG_THREADS: z.coerce.number().int().min(1).max(4).default(1),
  FFMPEG_TMP_DIR: z.string().default("/tmp/frateli-transcode"),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    const cleaned: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(process.env)) {
      cleaned[k] = v === "" ? undefined : v;
    }
    if (!cleaned.DATABASE_URL && cleaned.POSTGRES_URL) {
      cleaned.DATABASE_URL = cleaned.POSTGRES_URL;
    }
    if (cleaned.NEXT_PUBLIC_APP_URL) {
      cleaned.NEXT_PUBLIC_APP_URL = cleaned.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
    }
    cachedEnv = envSchema.parse(cleaned);
  }
  return cachedEnv;
}

export function getRedisQueueUrl(): string {
  const env = getEnv();
  return env.REDIS_QUEUE_URL || env.REDIS_URL || "redis://127.0.0.1:6379";
}

export function getRedisCacheUrl(): string {
  const env = getEnv();
  return env.REDIS_CACHE_URL || env.REDIS_URL || "redis://127.0.0.1:6379";
}

export function getEncryptionSecret(): string {
  const env = getEnv();
  return env.INTEGRATION_ENCRYPTION_KEY || env.SESSION_SECRET;
}
