import { describe, expect, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

import { beginWorkspaceCommandLog } from '../../scripts/daemon/helpers/commands-log';

describe('workspace commands log', () => {
  it('writes command first and appends DONE status after completion', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'daemon-commands-log-'));
    try {
      const handle = await beginWorkspaceCommandLog(workspaceRoot, 'echo hello');
      const commandsPath = path.join(workspaceRoot, 'commands.txt');
      const afterBegin = await fs.readFile(commandsPath, 'utf8');
      expect(afterBegin).toBe('echo hello\n');

      await handle.done();
      const afterDone = await fs.readFile(commandsPath, 'utf8');
      expect(afterDone).toBe('echo hello\n✅ DONE\n\n');
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('appends FAIL status and separator on failure', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'daemon-commands-log-fail-'));
    try {
      const handle = await beginWorkspaceCommandLog(workspaceRoot, 'false');
      await handle.fail();
      const commandsPath = path.join(workspaceRoot, 'commands.txt');
      const contents = await fs.readFile(commandsPath, 'utf8');
      expect(contents).toBe('false\n❌ FAIL\n----\n\n');
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    }
  });
});

