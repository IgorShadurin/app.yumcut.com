import fs from 'fs';
import path from 'path';

const ASSET_ROOT = path.resolve(__dirname, '../assets');

export const imageAssets = {
  frameOne: path.join(ASSET_ROOT, 'images', 'scene-1.png'),
  frameTwo: path.join(ASSET_ROOT, 'images', 'scene-2.png'),
};

export const videoAssets = {
  finalCut: path.join(ASSET_ROOT, 'video', 'final-demo.mp4'),
};

function flattenAssetMap(map: Record<string, string>) {
  return Object.values(map);
}

export function requiredAssets(): string[] {
  return [
    ...flattenAssetMap(imageAssets),
    ...flattenAssetMap(videoAssets),
  ];
}

export function ensureAssetsAvailable() {
  const missing = requiredAssets().filter((assetPath) => !fs.existsSync(assetPath));
  if (missing.length > 0) {
    throw new Error(`Missing daemon assets: ${missing.join(', ')}`);
  }
}
