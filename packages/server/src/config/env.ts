/**
 * Typed, validated environment. Fails fast at boot on missing/short secrets so a
 * misconfigured deployment never starts.
 */
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),

  // Absolute or relative paths; created if missing.
  DB_PATH: z.string().default('./data/akpoker.sqlite'),
  DATA_DIR: z.string().default('./data'),
  AVATAR_DIR: z.string().default('./data/avatars'),

  // Comma-separated allowlist of browser origins (CORS + Socket.IO).
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  // Secrets — must be long in production.
  JWT_SECRET: z.string().min(16).default('dev-only-jwt-secret-change-me-please'),
  COOKIE_SECRET: z.string().min(16).default('dev-only-cookie-secret-change-me!!'),

  // Cookies: set true behind HTTPS in production.
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  COOKIE_DOMAIN: z.string().optional(),

  // Direct HTTPS (e.g. self-signed cert) so getUserMedia/mic works without a proxy.
  // If both are set, the Node server serves HTTPS/WSS directly.
  HTTPS_KEY_PATH: z.string().optional(),
  HTTPS_CERT_PATH: z.string().optional(),

  // TURN / voice
  TURN_HOST: z.string().optional(),
  TURN_STATIC_AUTH_SECRET: z.string().optional(),
  TURN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  STUN_URLS: z.string().default('stun:stun.l.google.com:19302'),

  // Serve the built SPA from the Node process (true) or via an external proxy (false).
  SERVE_WEB: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  WEB_DIST: z.string().default('../web/dist'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  // Load a .env file from the current working directory if present. Does NOT
  // override variables already set in the environment (so Docker/CI/tests win).
  loadDotenv();
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    if (env.JWT_SECRET.startsWith('dev-only') || env.COOKIE_SECRET.startsWith('dev-only')) {
      throw new Error('Refusing to start in production with default dev secrets.');
    }
  }
  cached = env;
  return env;
}

export function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
