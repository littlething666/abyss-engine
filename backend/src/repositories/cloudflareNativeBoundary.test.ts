import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function resolveBackendRoot(): string {
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'wrangler.toml'))) return cwd;
  if (existsSync(join(cwd, 'backend', 'wrangler.toml'))) return join(cwd, 'backend');
  throw new Error(`cloudflareNativeBoundary.test: cannot locate backend/wrangler.toml from cwd=${cwd}`);
}

const BACKEND_ROOT = resolveBackendRoot();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

function read(paths: string[]): string {
  return paths.map((path) => readFileSync(path, 'utf8')).join('\n');
}

describe('Cloudflare-native backend boundary', () => {
  it('keeps active backend code free of retired hosted-database SDK and object-storage paths', () => {
    const active = read([
      ...walk(join(BACKEND_ROOT, 'src')).filter((path) => !path.endsWith('cloudflareNativeBoundary.test.ts')),
      join(BACKEND_ROOT, 'package.json'),
      join(BACKEND_ROOT, 'wrangler.toml'),
    ]);

    const forbidden = [
      '@' + 'supa' + 'base/supa' + 'base-js',
      'SUPA' + 'BASE_',
      'create' + 'Client(',
      '.storage.from',
      'Supa' + 'base Storage',
    ];
    for (const token of forbidden) expect(active).not.toContain(token);
  });

  it('does not restore retired settings tables or coordination bindings for v1', () => {
    const active = read([
      ...walk(join(BACKEND_ROOT, 'src')).filter((path) => !path.endsWith('cloudflareNativeBoundary.test.ts')),
      join(BACKEND_ROOT, 'wrangler.toml'),
      ...walk(join(BACKEND_ROOT, 'd1')),
    ]);

    const forbidden = [
      'device_' + 'settings',
      'generation_settings',
      'response_healing_setting',
      '[[durable_' + 'objects',
    ];
    for (const token of forbidden) expect(active).not.toContain(token);
  });

  it('keeps numbered backend migrations empty before release', () => {
    const migrationsDir = join(BACKEND_ROOT, 'migrations');
    const migrationFiles = existsSync(migrationsDir)
      ? readdirSync(migrationsDir).filter((name) => name.endsWith('.sql'))
      : [];
    expect(migrationFiles).toEqual([]);
  });
});
