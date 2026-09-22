import 'reflect-metadata';
import { getEnv } from './config/env';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

export async function createApp(): Promise<NestExpressApplication> {
  const env = getEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new ConsoleLogger({ json: env.NODE_ENV === 'production', logLevels: levelsFor(env.LOG_LEVEL) }),
  });
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/*path'] });
  app.enableCors({ origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : true, credentials: true, exposedHeaders: ['x-request-id'] });
  app.enableShutdownHooks();
  app.set('trust proxy', 1);
  return app;
}

function levelsFor(level: string): ('debug' | 'log' | 'warn' | 'error' | 'verbose')[] {
  switch (level) {
    case 'debug':
      return ['debug', 'log', 'warn', 'error', 'verbose'];
    case 'warn':
      return ['warn', 'error'];
    case 'error':
      return ['error'];
    default:
      return ['log', 'warn', 'error'];
  }
}

async function bootstrap() {
  const env = getEnv();
  const app = await createApp();
  await app.listen(env.API_PORT);
  new Logger('Bootstrap').log(`MADART API listening on http://localhost:${env.API_PORT}/api/v1 (health: /health, realtime: /rt)`);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
