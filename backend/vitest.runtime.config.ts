import path from 'node:path';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: 'src/index.ts',
      wrangler: { configPath: './wrangler.toml' },
      remoteBindings: false,
    }),
  ],
  test: {
    globals: true,
    include: ['src/runtimeTests/**/*.runtime.test.ts'],
    isolate: true,
  },
  workers: {
    isolatedStorage: true,
  },
  resolve: {
    alias: {
      '@contracts': path.resolve(__dirname, '../src/features/generationContracts'),
    },
  },
});
