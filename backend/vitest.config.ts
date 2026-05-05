import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    // Use 'forks' pool to avoid rolldown native binding issues on ARM64 Linux.
    // Vitest 4: pool is a top-level option (poolOptions was removed).
    pool: 'forks',
  },
});
