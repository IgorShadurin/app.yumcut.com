import { describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

import { readTemplateOriginalPath, rememberTemplateOriginalPath, saveTemplateOriginalScript } from '../../scripts/daemon/helpers/template-original';

describe('template-original helpers', () => {
  it('persists a local template original script and reads it back via pointer', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'daemon-template-original-'));
    try {
      const info = {
        projectRoot: path.join(tmpRoot, 'proj'),
        workspaceRoot: path.join(tmpRoot, 'workspace'),
        logsRoot: path.join(tmpRoot, 'logs'),
        languageCode: 'ru',
        languageWorkspace: path.join(tmpRoot, 'workspace', 'ru'),
        languageLogsRoot: path.join(tmpRoot, 'logs', 'ru'),
      } as any;
      const local = await saveTemplateOriginalScript(info, 'Hello from template.');
      await rememberTemplateOriginalPath(info, local);

      const resolved = await readTemplateOriginalPath(info);
      expect(resolved).toBe(local);
      const contents = await fs.readFile(resolved!, 'utf8');
      expect(contents).toBe('Hello from template.');
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  });
});
