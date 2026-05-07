import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

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
      ...walk(join(ROOT, 'src')).filter((path) => !path.endsWith('cloudflareNativeBoundary.test.ts')),
      join(ROOT, 'package.json'),
      join(ROOT, 'wrangler.toml'),
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
      ...walk(join(ROOT, 'src')).filter((path) => !path.endsWith('cloudflareNativeBoundary.test.ts')),
      join(ROOT, 'wrangler.toml'),
      ...walk(join(ROOT, 'd1')),
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
    const migrationFiles = readdirSync(join(ROOT, 'migrations')).filter((name) => name.endsWith('.sql'));
    expect(migrationFiles).toEqual([]);
  });
});
