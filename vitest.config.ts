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
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        '**/*.d.ts',
        '**/*.config.ts',
        'src/**/*.stories.tsx',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
      ],
    },
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
