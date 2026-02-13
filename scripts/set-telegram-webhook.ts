#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

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
    // missing .env is fine; rely on existing env vars
  }
}

function exitWithUsage(message?: string): never {
  if (message) {
    console.error(message);
  }
  console.error('Usage: npm run telegram:webhook:set -- <webhook-url>');
  process.exit(1);
}

async function main() {
  loadDotEnv(process.cwd());

  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  const [, , webhookUrlArg] = process.argv;
  const webhookUrl = (webhookUrlArg || '').trim();

  if (!token) {
    exitWithUsage('TELEGRAM_BOT_TOKEN is not set.');
  }
  if (!secret) {
    exitWithUsage('TELEGRAM_WEBHOOK_SECRET is not set.');
  }
  if (!webhookUrl) {
    exitWithUsage('Webhook URL is required.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    exitWithUsage('Webhook URL must be a valid absolute URL.');
  }

  const endpoint = `https://api.telegram.org/bot${token}/setWebhook`;
  const payload = { url: parsedUrl.toString(), secret_token: secret };

  console.log(`Setting Telegram webhook to ${parsedUrl.toString()}...`);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    console.error('Failed to contact Telegram API:', err?.message || String(err));
    process.exit(1);
  }

  let bodyText = '';
  try {
    bodyText = await response.text();
  } catch (err: any) {
    console.error('Failed to read Telegram response:', err?.message || String(err));
    process.exit(1);
  }

  if (bodyText.trim().length === 0) {
    console.error('No response received from Telegram API.');
    process.exit(1);
  }

  try {
    const parsed = JSON.parse(bodyText);
    if (parsed.ok) {
      console.log(parsed.description || 'Webhook updated successfully.');
      process.exit(0);
    }
    console.error('Failed to set webhook:', parsed.description || bodyText);
    process.exit(1);
  } catch {
    console.error('Unexpected response from Telegram API:', bodyText);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error while setting webhook:', err);
  process.exit(1);
});
