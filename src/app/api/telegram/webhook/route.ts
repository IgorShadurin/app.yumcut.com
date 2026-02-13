import { NextRequest } from 'next/server';
import { ok, forbidden } from '@/server/http';
import { withApiError } from '@/server/errors';
import { config } from '@/server/config';
import { getTelegramUpdatesMode, isTelegramEnabled, processTelegramUpdate } from '@/server/telegram';

export const POST = withApiError(async function POST(req: NextRequest) {
  if (!isTelegramEnabled()) {
    return forbidden('Telegram integration disabled');
  }
  if (getTelegramUpdatesMode() === 'polling') {
    return forbidden('Telegram webhook disabled (polling mode)');
  }
  const secret = config.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (secret) {
    // Telegram forwards the `secret_token` (set via setWebhook) using this header:
    // https://core.telegram.org/bots/api#setwebhook
    const provided = req.headers.get('x-telegram-bot-api-secret-token');
    if (provided !== secret) {
      return forbidden('Invalid Telegram secret token');
    }
  }
  const payload = await req.json();
  await processTelegramUpdate(payload);
  return ok({ ok: true });
}, 'Failed to process Telegram update');
