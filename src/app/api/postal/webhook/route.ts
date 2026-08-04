import { NextRequest } from 'next/server';
import { withApiError } from '@/server/errors';
import { forbidden, ok } from '@/server/http';
import { config } from '@/server/config';
import { suppressPostalFailureInPlunk, verifyPostalWebhook } from '@/server/emails/postal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiError(async function POST(req: NextRequest) {
  if (!config.POSTAL_WEBHOOK_PUBLIC_KEY?.trim()) {
    return forbidden('Postal webhook public key is not configured');
  }

  const rawBody = await req.text();
  const envelope = verifyPostalWebhook(rawBody, req.headers);
  if (!envelope) {
    return forbidden('Invalid Postal webhook signature');
  }

  const result = await suppressPostalFailureInPlunk(envelope);
  return ok({
    ok: true,
    event: envelope.event ?? null,
    handled: result.handled,
  });
}, 'Failed to process Postal webhook');
