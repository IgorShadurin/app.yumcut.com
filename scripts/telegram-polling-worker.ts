#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const POLL_TIMEOUT_SECONDS = 50;
const BACKOFF_ON_ERROR_MS = 5_000;

function loadDotEnv(rootDir: string) {
  const envPath = path.join(rootDir, '.env');
  try {
    const txt = fs.readFileSync(envPath, 'utf8');
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) {
        (process.env as any)[key] = val;
      }
    }
  } catch {
    // Missing .env is fine; rely on process env.
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  loadDotEnv(process.cwd());

  const [{ config }, { isTelegramEnabled, getTelegramUpdatesMode, processTelegramUpdate }, { prisma }] = await Promise.all([
    import('../src/server/config'),
    import('../src/server/telegram'),
    import('../src/server/db'),
  ]);

  if (!isTelegramEnabled()) {
    console.error('Telegram integration is not fully configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME.');
    process.exit(1);
  }

  if (getTelegramUpdatesMode() !== 'polling') {
    console.error('TELEGRAM_UPDATES_MODE must be set to "polling" to run the polling worker.');
    process.exit(1);
  }

  const token = (config.TELEGRAM_BOT_TOKEN || '').trim();
  const apiBase = `https://api.telegram.org/bot${token}`;
  let offset: number | null = null;

  let shuttingDown = false;
  async function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await prisma.$disconnect();
    } catch {}
    process.exit(code);
  }

  process.on('SIGINT', () => void shutdown(0));
  process.on('SIGTERM', () => void shutdown(0));

  console.log('Starting Telegram polling worker...');

  while (true) {
    const payload: Record<string, unknown> = {
      timeout: POLL_TIMEOUT_SECONDS,
      allowed_updates: ['message'],
    };
    if (offset !== null) {
      payload.offset = offset;
    }

    try {
      const response = await fetch(`${apiBase}/getUpdates`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      if (!text) {
        continue;
      }

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        console.error('Failed to parse Telegram response:', text);
        await sleep(BACKOFF_ON_ERROR_MS);
        continue;
      }

      if (!json.ok) {
        console.error('Telegram API error:', json.description || text);
        await sleep(BACKOFF_ON_ERROR_MS);
        continue;
      }

      const updates: any[] = Array.isArray(json.result) ? json.result : [];
      for (const update of updates) {
        if (typeof update.update_id === 'number') {
          offset = update.update_id + 1;
        }
        try {
          await processTelegramUpdate(update);
        } catch (err) {
          console.error('Failed to process Telegram update:', err);
        }
      }
    } catch (err) {
      console.error('Telegram polling failed:', err);
      await sleep(BACKOFF_ON_ERROR_MS);
    }
  }
}

main().catch((err) => {
  console.error('Unexpected error in Telegram polling worker:', err);
  process.exit(1);
});

