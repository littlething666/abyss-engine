import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import path from 'path';

export default defineConfig({
  plugins: [
    {
      name: 'prompt-raw-loader',
      enforce: 'pre',
      load(id) {
        if (!id.endsWith('.prompt')) {
          return null;
        }

        return `export default ${JSON.stringify(readFileSync(id, 'utf8'))};`;
      },
    },
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.ts', 'workers/**/*.test.ts', 'backend/**/*.test.ts'],
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
      '@contracts': path.resolve(__dirname, './src/features/generationContracts'),
      'cloudflare:workers': path.resolve(__dirname, './backend/src/testStubs/cloudflareWorkers.ts'),
      'cloudflare:workflows': path.resolve(__dirname, './backend/src/testStubs/cloudflareWorkflows.ts'),
    },
  },
});
