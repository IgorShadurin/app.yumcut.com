import { promises as fs } from 'fs';
import path from 'path';

export async function resolveImagesDirectory(workspaceRoot: string, explicit?: string | null): Promise<string> {
  const candidates = new Set<string>();
  if (explicit && explicit.trim()) candidates.add(path.resolve(explicit));
  // v2 output (Qwen Image Edit pipeline)
  candidates.add(path.resolve(workspaceRoot, 'qwen-image-edit', 'prepared'));
  candidates.add(path.resolve(workspaceRoot, 'comics-vertical', 'prepared'));
  candidates.add(path.resolve(workspaceRoot, 'comics-vertical', 'images'));
  candidates.add(path.resolve(workspaceRoot, 'images'));

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {}
  }

  throw new Error(`Images directory not found. Checked: ${Array.from(candidates).join(', ')}`);
}
