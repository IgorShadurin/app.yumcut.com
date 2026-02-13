import { promises as fs } from 'fs';

export async function assertFileExists(filePath: string, description: string) {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`${description} path is not a file: ${filePath}`);
    }
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      throw new Error(`${description} file not found at ${filePath}`);
    }
    throw err;
  }
}
