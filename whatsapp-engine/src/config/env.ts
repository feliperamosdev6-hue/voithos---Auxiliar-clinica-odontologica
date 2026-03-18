import dotenv from 'dotenv';

dotenv.config();

const asNumber = (value: string | undefined, fallback: number): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: asNumber(process.env.PORT, 8099),
  logLevel: process.env.LOG_LEVEL || 'info',
  databaseUrl: process.env.DATABASE_URL || '',
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: asNumber(process.env.REDIS_PORT, 6379),
  redisPassword: process.env.REDIS_PASSWORD || '',
  serviceInternalApiToken: process.env.SERVICE_INTERNAL_API_TOKEN || process.env.INTERNAL_API_TOKEN || '',
  adminPanelToken: process.env.ADMIN_PANEL_TOKEN || '',
  internalApiToken: process.env.INTERNAL_API_TOKEN || '',
  centralBackendBaseUrl: process.env.CENTRAL_BACKEND_BASE_URL || '',
  centralBackendServiceToken: process.env.CENTRAL_BACKEND_SERVICE_TOKEN || '',
  authEncryptionKeyHex: process.env.AUTH_ENCRYPTION_KEY_HEX || '',
  authEncryptionKeyBase64: process.env.AUTH_ENCRYPTION_KEY_BASE64 || '',
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || '',
  sessionsDir: process.env.SESSIONS_DIR || '.sessions',
  workerConcurrency: asNumber(process.env.WORKER_CONCURRENCY, 4),
  messageMaxAttempts: asNumber(process.env.MESSAGE_MAX_ATTEMPTS, 3),
  messageBackoffMs: asNumber(process.env.MESSAGE_BACKOFF_MS, 4000),
};

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}
