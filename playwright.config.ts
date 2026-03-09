import { defineConfig, devices } from '@playwright/test';

const CI_MODE = !!process.env.CI;
const LOCAL_BROWSER_CACHE = process.env.PW_CI_LOCAL_BINARY;

if (LOCAL_BROWSER_CACHE) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = LOCAL_BROWSER_CACHE;
}

const parseBrowserArgList = (value?: string): string[] =>
  value
    ? value
        .split(',')
        .map((flag) => flag.trim())
        .filter((flag) => flag.length > 0)
    : [];

const defaultWebGpuFlags = parseBrowserArgList(process.env.PW_WEBGPU_FLAGS);
const fallbackWebGpuFlags = parseBrowserArgList(process.env.PW_WEBGPU_FALLBACK_FLAGS);

const isLinux = process.platform === 'linux';

const baseWebGpuArgs =
  defaultWebGpuFlags.length > 0
    ? [...defaultWebGpuFlags, ...fallbackWebGpuFlags]
    : [
        '--enable-unsafe-webgpu',
        ...(isLinux ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface'] : []),
      ];

const sandboxArgs = process.env.PW_ENABLE_NO_SANDBOX === '1' || CI_MODE ? ['--no-sandbox'] : [];
const browserCommonArgs = [...baseWebGpuArgs, ...sandboxArgs];
const browserArgs = [...new Set(browserCommonArgs)];

const chromiumHeadfulProject = {
  name: 'chromium-headful',
  use: {
    ...devices['Desktop Chrome'],
    headless: false,
    launchOptions: {
      args: process.env.PW_WEBGPU_HEADFUL_ARGS
        ? parseBrowserArgList(process.env.PW_WEBGPU_HEADFUL_ARGS)
        : ['--enable-unsafe-webgpu'],
    },
  },
};

const chromiumHeadlessProject = {
  name: 'chromium-headless-ci',
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    launchOptions: {
      args: ['--headless=new', ...browserArgs],
    },
  },
};

export default defineConfig({
  // Test directory - relative to this config file
  testDir: './tests',
  testMatch: '**/*.spec.ts',

  fullyParallel: !CI_MODE,
  outputDir: 'playwright-results',
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-results/results.json' }],
  ],

  retries: process.env.CI ? 2 : 0,
  globalTimeout: 120 * 1000,
  timeout: 60 * 1000,

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    testIdAttribute: 'data-testid',
  },

  workers: process.env.CI ? 1 : undefined,
  projects: [
    ...(CI_MODE
      ? [chromiumHeadlessProject]
      : [chromiumHeadfulProject, chromiumHeadlessProject]),
  ],

  webServer: {
    command: 'npm run dev -- --hostname 0.0.0.0 --port 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
