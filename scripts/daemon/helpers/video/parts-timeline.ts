import path from 'path';
import { promises as fs } from 'fs';
import { log } from '../logger';

type MetadataBlock = {
  id?: string;
  start?: number | string | null;
  end?: number | string | null;
  startTime?: number | string | null;
  endTime?: number | string | null;
  duration?: number | string | null;
  durationMs?: number | string | null;
};

export async function writePartsTimeline(params: {
  projectId: string;
  workspaceRoot: string;
  metadataPath: string;
  imagesDir?: string | null;
}) {
  const { projectId, workspaceRoot, metadataPath, imagesDir } = params;
  let metadataRaw: string;
  try {
    metadataRaw = await fs.readFile(metadataPath, 'utf8');
  } catch (err: any) {
    log.warn('Failed to read metadata for parts timeline', {
      projectId,
      metadataPath,
      error: err?.message || String(err),
    });
    return;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(metadataRaw);
  } catch (err: any) {
    log.warn('Failed to parse metadata JSON for parts timeline', {
      projectId,
      metadataPath,
      error: err?.message || String(err),
    });
    return;
  }

  const blocks: MetadataBlock[] = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
  if (blocks.length === 0) {
    return;
  }

  const outputPath = path.join(workspaceRoot, 'video-basic-effects', 'parts.txt');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const imageMap = await buildImageMap(imagesDir);

  const startTimes = blocks.map((block) => parseTimestampMs(block?.start ?? block?.startTime));
  const endTimes = blocks.map((block) => parseTimestampMs(block?.end ?? block?.endTime));
  const durations = blocks.map((block) => parseTimestampMs(block?.durationMs) ?? parseTimestampMs(block?.duration));

  const lines: string[] = [];
  let runningStart = 0;

  for (let idx = 0; idx < blocks.length; idx += 1) {
    const baseName = String(idx + 1).padStart(3, '0');
    const videoName = `${baseName}.mp4`;
    const parsedStart = startTimes[idx];
    const parsedEnd = endTimes[idx];
    const nextStart = idx + 1 < startTimes.length ? startTimes[idx + 1] : null;
    const durationFromField = durations[idx];

    const startMs = parsedStart ?? runningStart;
    const endMs =
      (typeof parsedEnd === 'number' && parsedEnd > startMs)
        ? parsedEnd
        : (typeof nextStart === 'number' && nextStart > startMs)
          ? nextStart
          : (typeof durationFromField === 'number' && durationFromField > 0)
            ? startMs + durationFromField
            : startMs + 2500;

    const durationMs = Math.max(1, endMs - startMs);
    runningStart = endMs;

    const imageName = imageMap.get(baseName) ?? `${baseName}.jpg`;
    lines.push(
      `${imageName} - ${videoName} - Duration: ${formatTimestamp(durationMs)} - Timeline: ${formatTimestamp(startMs)}-${formatTimestamp(endMs)}`,
    );
  }

  try {
    await fs.writeFile(outputPath, lines.join('\n'), 'utf8');
  } catch (err: any) {
    log.warn('Failed to write parts timeline file', {
      projectId,
      outputPath,
      error: err?.message || String(err),
    });
  }
}

async function buildImageMap(imagesDir?: string | null): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!imagesDir) return map;
  let entries: string[];
  try {
    entries = await fs.readdir(imagesDir);
  } catch {
    return map;
  }
  for (const entry of entries) {
    const match = /^(\d{3})\.[^.]+$/i.exec(entry);
    if (!match) continue;
    const base = match[1];
    if (!map.has(base)) {
      map.set(base, entry);
    }
  }
  return map;
}

function parseTimestampMs(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    return Math.max(0, numeric);
  }

  const parts = text.split(':').map((p) => p.trim());
  if (parts.length < 1 || parts.length > 3) return null;

  const secondsPart = parts[parts.length - 1] ?? '';
  const [secRaw, msRaw = '0'] = secondsPart.split('.');
  const seconds = Number(secRaw);
  if (!Number.isFinite(seconds) || seconds < 0) return null;

  const msPadded = (msRaw || '0').slice(0, 3).padEnd(3, '0');
  const milliseconds = Number(msPadded);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;

  let minutes = 0;
  let hours = 0;
  if (parts.length === 2) {
    minutes = Number(parts[0]);
    if (!Number.isFinite(minutes) || minutes < 0) return null;
  } else if (parts.length === 3) {
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
    if (!Number.isFinite(hours) || hours < 0) return null;
    if (!Number.isFinite(minutes) || minutes < 0) return null;
  }

  return Math.round((((hours * 60 + minutes) * 60) + seconds) * 1000 + milliseconds);
}

function formatTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(clamped / 1000);
  const milliseconds = clamped % 1000;
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number, digits: number) => String(value).padStart(digits, '0');
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(milliseconds, 3)}`;
}
