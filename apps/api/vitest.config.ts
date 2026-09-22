import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    globals: false,
    root: './',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    setupFiles: ['./test/setup-env.ts'],
  },
  plugins: [
    // Required for NestJS decorator metadata (constructor injection by type).
    swc.vite({ module: { type: 'es6' }, jsc: { transform: { decoratorMetadata: true, legacyDecorator: true } } }),
  ],
});
