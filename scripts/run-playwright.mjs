import { spawnSync } from 'node:child_process';

const shouldSkip = process.env.PW_PLAYWRIGHT_SKIP_BROWSER_RUN === '1';
if (shouldSkip) {
  console.log('[playwright] PW_PLAYWRIGHT_SKIP_BROWSER_RUN is enabled; skipping browser launch.');
  process.exit(0);
}

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['playwright', 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error('[playwright] failed to invoke playwright:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
