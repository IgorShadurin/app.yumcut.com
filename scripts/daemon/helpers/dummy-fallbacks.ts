import path from 'path';
import { promises as fs } from 'fs';

const DUMMY_PART_CONTENT = 'DUMMY_VIDEO_PART';
const DUMMY_FINAL_CONTENT = 'DUMMY_FINAL_VIDEO';

export function isDummyScriptWorkspace(scriptWorkspaceV2: string): boolean {
  return scriptWorkspaceV2.includes('tests/daemon/dummy-scripts');
}

export async function writeDummyMainVideo(workspaceRoot: string): Promise<string> {
  const videoDir = path.join(workspaceRoot, 'video-basic-effects', 'final');
  await fs.mkdir(videoDir, { recursive: true });
  const output = path.join(videoDir, 'simple.1080p.mp4');
  await fs.writeFile(output, Buffer.from(DUMMY_PART_CONTENT));
  return output;
}

export async function writeDummyMergedVideo(workspaceRoot: string): Promise<string> {
  const mergeDir = path.join(workspaceRoot, 'video-merge-layers');
  await fs.mkdir(mergeDir, { recursive: true });
  const output = path.join(mergeDir, 'final.1080p.mp4');
  await fs.writeFile(output, Buffer.from(DUMMY_FINAL_CONTENT));
  return output;
}

export async function maybeWriteFakeDynamicCharacter(sharedImagesWorkspace: string) {
  const fakeMode = process.env.DAEMON_FAKE_CLI === '1' || process.env.DAEMON_USE_FAKE_CLI === '1';
  if (!fakeMode) return null;
  const uniqueCharPath = path.join(sharedImagesWorkspace, 'qwen-image-edit', 'unique-character.jpg');
  await fs.mkdir(path.dirname(uniqueCharPath), { recursive: true });
  await fs.writeFile(uniqueCharPath, 'FAKE_CHARACTER_IMAGE', 'utf8');
  return uniqueCharPath;
}
