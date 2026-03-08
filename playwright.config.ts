import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * Setup for Abyss Engine - 3D Spaced Repetition Learning App
 *
 * Key features:
 * - Web server auto-start for Next.js dev
 * - Chromium only (WebGPU/3D testing)
 * - Trace on first retry for debugging
 * - HTML reporter for test results
 */
export default defineConfig({
  // Test directory - relative to this config file
  testDir: './tests',

  // Test matching patterns
  testMatch: '**/*.spec.ts',

  // Run tests in parallel
  fullyParallel: true,

  // Fail CI builds on .only
  forbidOnly: !!process.env.CI,

  // Retry failed tests
  retries: process.env.CI ? 2 : 0,

  // Workers for parallel execution
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  // Global test timeout - increased for WebGPU/CI environments
  timeout: 60 * 1000,

  // Use settings for all tests
  use: {
    // Base URL for all tests
    baseURL: 'http://localhost:3000',

    // Collect trace on first retry
    trace: 'on-first-retry',

    // Take screenshot only on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

  },

  // Project configurations
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use headed mode for consistent WebGPU context initialization
        headless: false,
        // Launch options tuned for WebGPU/3D validation in CI
        launchOptions: {
          args: [
            '--enable-unsafe-webgpu',
            '--no-sandbox',
          ],
        },
      },
    },
  ],

  // Web server configuration
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    // Reuse server if not in CI
    reuseExistingServer: !process.env.CI,
    // Timeout for web server to start
    timeout: 120 * 1000,
    // Wait for the server to respond before running tests
    stdout: 'pipe',
    stderr: 'pipe',
  },

  // Output directory for test artifacts
  outputDir: 'playwright-results',
});
