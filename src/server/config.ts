import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_IOS_CLIENT_ID: z.string().min(1).optional(),
  APPLE_WEB_CLIENT_ID: z.string().min(1).optional(),
  APPLE_IOS_CLIENT_ID: z.string().min(1).optional(),
  APPLE_APP_APPLE_ID: z.coerce.number().int().positive().optional(),
  APPLE_TEAM_ID: z.string().min(1).optional(),
  APPLE_KEY_ID: z.string().min(1).optional(),
  APPLE_PRIVATE_KEY: z.string().min(1).optional(),
  APPLE_IAP_SHARED_SECRET: z.string().min(1).optional(),
  APPLE_IAP_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  NEXTAUTH_URL: z.string().min(1).optional(),
  NEXTAUTH_SECRET: z.string().min(1).optional(),
  MOBILE_JWT_SECRET: z.string().min(32).optional(),
  MOBILE_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).default(30),
  MOBILE_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(180),
  SERVICE_API_PASSWORD: z.string().min(1).optional(),
  DAEMON_API_PASSWORD: z.string().min(1).optional(),
  MEDIA_ROOT: z.string().min(1).optional(),
  STORAGE_PUBLIC_URL: z.string().url().optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_BOT_USERNAME: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  TELEGRAM_UPDATES_MODE: z.enum(['webhook', 'polling']).default('webhook'),
  UPLOAD_SIGNING_PRIVATE_KEY: z.string().min(1).optional(),
  UPLOAD_SIGNING_PUBLIC_KEY: z.string().min(1).optional(),
  MEDIA_CORS_ALLOWLIST: z.string().optional(),
  RUNWARE_IMAGE_EDITOR_API_KEY: z.string().min(1).optional(),
  ENABLE_PUBLISH_SCHEDULER: z.coerce.number().int().default(0),
  PUBLISH_SCHEDULER_BETA_USERS: z.string().optional(),
  YOUTUBE_CLIENT_ID: z.string().min(1).optional(),
  YOUTUBE_CLIENT_SECRET: z.string().min(1).optional(),
  PUBLISH_CHANNEL_TOKEN_SECRET: z.string().min(32, 'PUBLISH_CHANNEL_TOKEN_SECRET must be at least 32 characters').optional(),
  REVIEW_LOGIN_EMAIL: z.string().min(1).optional(),
  REVIEW_LOGIN_PASSWORD: z.string().min(1).optional(),
  APPLE_SUBSCRIPTION_LOGS_ENABLED: z.preprocess(
    (value) => {
      if (value === undefined) return true;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['0', 'false', 'no', 'off'].includes(normalized)) {
          return false;
        }
        if (['1', 'true', 'yes', 'on'].includes(normalized)) {
          return true;
        }
      }
      return true;
    },
    z.boolean(),
  ),
  APPLE_SERVER_NOTIFICATION_TELEGRAM_ENABLED: z.preprocess(
    (value) => {
      if (value === undefined) return false;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
      }
      return false;
    },
    z.boolean(),
  ),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(): AppConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // We don't throw to allow partial dev workflows; specific features will check on use.
    // eslint-disable-next-line no-console
    console.warn('Config validation warnings:', parsed.error.flatten().fieldErrors);
    // Coerce minimal config so app can import this module.
    return process.env as unknown as AppConfig;
  }
  return parsed.data;
}

export const config = loadConfig();
