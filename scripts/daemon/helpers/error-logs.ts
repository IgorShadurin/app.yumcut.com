import path from 'path';
import { promises as fs } from 'fs';
import { loadConfig } from './config';

let cachedWorkspace: string | null | undefined;

function resolveProjectsWorkspace(): string | null {
  if (cachedWorkspace !== undefined) return cachedWorkspace;
  try {
    cachedWorkspace = loadConfig().projectsWorkspace;
    return cachedWorkspace;
  } catch (err) {
    const fallback = process.env.DAEMON_PROJECTS_WORKSPACE;
    if (fallback && fallback.trim().length > 0) {
      cachedWorkspace = path.resolve(fallback.trim());
      return cachedWorkspace;
    }
  }
  cachedWorkspace = null;
  return cachedWorkspace;
}

export async function persistProjectErrorLog(projectId: unknown, payload: Record<string, unknown>) {
  if (typeof projectId !== 'string' || projectId.trim().length === 0) return;
  const workspace = resolveProjectsWorkspace();
  if (!workspace) return;
  const safeId = projectId.trim();
  const dir = path.join(workspace, safeId, 'logs', 'errors');
  try {
    await fs.mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/:/g, '-');
    const filePath = path.join(dir, `error-${stamp}.json.txt`);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // Swallow file system errors to avoid masking the original failure.
  }
}
