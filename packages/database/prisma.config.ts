import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

// The .env lives at the repository root; also accept a package-local one.
loadEnv({ path: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../../.env')] });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
