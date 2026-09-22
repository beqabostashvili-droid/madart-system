import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// Load .env from the repo root (and the app folder) once, before Nest boots.
loadEnv({ path: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../../.env')] });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(4000),
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('12h'),
  DEVICE_TOKEN_TTL: z.string().default('3650d'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PAYMENT_TERMINAL_PROVIDER: z.enum(['MOCK_TERMINAL']).default('MOCK_TERMINAL'),
  MOCK_TERMINAL_DELAY_MS: z.coerce.number().int().min(0).default(1500),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const ENV = Symbol('ENV');
