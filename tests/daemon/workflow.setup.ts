import { afterEach } from 'vitest';
import { rm } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { mkdir } from 'fs/promises';

const baseDir = path.resolve('tests/daemon/workspaces');

afterEach(async () => {
  try {
    await rm(baseDir, { recursive: true, force: true });
    await mkdir(baseDir, { recursive: true });
  } catch {}
});
