#!/usr/bin/env tsx
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const API_BASE = 'https://api.elevenlabs.io/v1';

function getApiKey(): string {
  const cli = process.argv.find((a) => a.startsWith('--api-key='));
  const key = cli ? cli.split('=')[1] : process.env.ELEVENLABS_API_KEY;
  if (!key) {
    console.error('Missing ELEVENLABS_API_KEY. Provide via env or --api-key=...');
    process.exit(1);
  }
  return key;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function fetchJson(url: string, apiKey: string) {
  const res = await fetch(url, {
    headers: { 'accept': 'application/json', 'xi-api-key': apiKey },
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function fetchBuffer(url: string) {
  const res = await fetch(url, { headers: { 'accept': 'audio/mpeg' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, contentType: res.headers.get('content-type') || 'audio/mpeg' };
}

async function loadVoices() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.templateVoice.findMany({
      where: { isPublic: true, voiceProvider: 'elevenlabs', externalId: { not: null } },
      orderBy: [{ weight: 'desc' }, { createdAt: 'asc' }],
      select: { externalId: true, title: true, previewPath: true },
    });
    return rows
      .filter((row): row is { externalId: string; title: string; previewPath: string | null } => !!row.externalId)
      .map((row) => ({ id: row.externalId, name: row.title || row.externalId, previewPath: row.previewPath ?? `/voices/${row.externalId}.mp3` }));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

async function resolvePreviewUrl(voiceId: string, apiKey: string): Promise<string | null> {
  try {
    const data: any = await fetchJson(`${API_BASE}/voices/${voiceId}`, apiKey);
    if (typeof data?.preview_url === 'string' && data.preview_url.startsWith('http')) return data.preview_url;
    const sample = Array.isArray(data?.samples) && data.samples.length > 0 ? data.samples[0] : null;
    if (sample?.sample_id) return `${API_BASE}/voices/${voiceId}/samples/${sample.sample_id}/audio`;
    return null;
  } catch (err) {
    console.error(`Failed to resolve preview for ${voiceId}:`, (err as any)?.message || String(err));
    return null;
  }
}

async function main() {
  const apiKey = getApiKey();
  const voices = await loadVoices();
  const outDir = path.resolve(process.cwd(), 'public', 'voices');
  await ensureDir(outDir);
  let ok = 0, fail = 0;
  for (const v of voices) {
    const relative = v.previewPath.startsWith('/') ? v.previewPath.slice(1) : v.previewPath;
    const target = path.join(outDir, relative.replace(/^voices\//, ''));
    await ensureDir(path.dirname(target));
    try {
      const preview = await resolvePreviewUrl(v.id, apiKey);
      if (!preview) { console.warn(`No preview found for ${v.name} (${v.id})`); fail++; continue; }
      const { buf } = await fetchBuffer(preview);
      await fs.writeFile(target, buf);
      console.log(`Saved preview: ${path.relative(process.cwd(), target)} (${(buf.length/1024).toFixed(1)} KB)`);
      ok++;
    } catch (err) {
      console.error(`Failed to save preview for ${v.name} (${v.id}):`, (err as any)?.message || String(err));
      fail++;
    }
  }
  console.log(`Done. Saved=${ok}, Failed=${fail}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
