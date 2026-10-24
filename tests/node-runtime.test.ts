import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { isSupportedNode } = require('../scripts/check-node-version.cjs');

describe('Node.js security baseline', () => {
  it.each(['24.11.1', '24.22.0', '22.23.3', '20.20.2', '25.0.0', '26.12.1', '24.22.1-rc.1', 'invalid'])('rejects unsupported runtime %s', (version) => {
    expect(isSupportedNode(version)).toBe(false);
  });

  it.each(['24.22.1', 'v24.22.1', '24.22.2', '24.23.0'])('accepts patched Node 24 runtime %s', (version) => {
    expect(isSupportedNode(version)).toBe(true);
  });

  it('keeps runtime metadata and CI aligned', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    expect(pkg.engines.node).toBe('>=24.22.1 <25');
    expect(lock.packages[''].engines).toEqual(pkg.engines);
    expect(readFileSync('.nvmrc', 'utf8').trim()).toBe('24.22.1');
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain("node-version-file: '.nvmrc'");
  });
});
