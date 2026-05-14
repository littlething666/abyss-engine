import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/*.spec.ts',
      'packages/generation-contracts/**/*.test.ts',
      'workers/**/*.test.ts',
      'backend/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/e2e/**', 'backend/src/runtimeTests/**/*.runtime.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        '**/*.d.ts',
        '**/*.config.ts',
        'src/**/*.stories.tsx',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.spec.ts',
      ],
    },
    setupFiles: [path.resolve(__dirname, './vitest.setup.ts')],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@contracts': path.resolve(__dirname, './packages/generation-contracts/src'),
      'cloudflare:workers': path.resolve(__dirname, './backend/src/testStubs/cloudflareWorkers.ts'),
      'cloudflare:workflows': path.resolve(__dirname, './backend/src/testStubs/cloudflareWorkflows.ts'),
    },
  },
});
