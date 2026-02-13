import path from 'path';
import { promises as fs } from 'fs';
import { assertFileExists } from './assert-file-exists';
import { log } from '../logger';

export async function injectCtaIntoParts(options: {
  projectId: string;
  workspaceRoot: string;
  logDir: string;
  include: boolean;
  targetLanguage?: string | null;
  voiceExternalId?: string | null;
}) {
  const { projectId, workspaceRoot, logDir, include, targetLanguage, voiceExternalId } = options;
  if (!include) return;
  try {
    const partsDir = path.join(workspaceRoot, 'video-basic-effects', 'parts');
    await fs.mkdir(partsDir, { recursive: true });
    const partsFinal = path.join(partsDir, 'final.mp4');
    try { await fs.rm(partsFinal, { force: true }); } catch {}

    const repoRoot = process.cwd();
    const lang = (targetLanguage || 'en').toLowerCase();
    const sanitize = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_');
    const candidates: string[] = [];
    if (voiceExternalId) {
      const v = voiceExternalId;
      const vl = v.toLowerCase();
      const vs = sanitize(v);
      const vls = sanitize(vl);
      candidates.push(path.join(repoRoot, 'content', 'cta', lang, v, 'subscribe.mp4'));
      if (vs !== v) candidates.push(path.join(repoRoot, 'content', 'cta', lang, vs, 'subscribe.mp4'));
      if (vl !== v) candidates.push(path.join(repoRoot, 'content', 'cta', lang, vl, 'subscribe.mp4'));
      if (vls !== vl) candidates.push(path.join(repoRoot, 'content', 'cta', lang, vls, 'subscribe.mp4'));
    }
    candidates.push(path.join(repoRoot, 'content', 'cta', lang, 'subscribe.mp4'));
    candidates.push(path.join(repoRoot, 'content', 'cta', 'universal.mp4'));

    let cta: string | null = null;
    const checked: Array<{ path: string; exists: boolean }> = [];
    for (const cand of candidates) {
      try { await assertFileExists(cand, 'CTA video'); checked.push({ path: cand, exists: true }); cta = cand; break; }
      catch { checked.push({ path: cand, exists: false }); }
    }

    if (cta) {
      await fs.copyFile(cta, partsFinal);
      log.info('CTA injected into parts for basic-effects', { projectId, partsFinal, cta, lang, voiceExternalId, cwd: repoRoot });
    } else {
      log.warn('CTA video not found; skipping CTA injection for basic-effects', { projectId, lang, voiceExternalId, cwd: repoRoot });
    }

    // Persist a JSON debug record alongside video-parts logs
    try {
      await fs.mkdir(logDir, { recursive: true });
      const stamp = new Date().toISOString().replaceAll(':', '-');
      const debugPath = path.join(logDir, `cta-selection-${stamp}.json.txt`);
      const payload = { projectId, lang, voiceExternalId, cwd: repoRoot, partsFinal, chosen: cta, candidates: checked };
      await fs.writeFile(debugPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    } catch {}
  } catch (err: any) {
    log.warn('Failed to prepare CTA parts/final.mp4; continuing', { projectId, error: err?.message || String(err) });
  }
}
