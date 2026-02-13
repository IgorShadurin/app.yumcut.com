import { z } from 'zod';
import { ok } from '@/server/http';
import { withApiError } from '@/server/errors';
import { revokeMobileSession } from '@/server/mobile-auth';

const BodySchema = z.object({
  refreshToken: z.string().min(20),
});

export const POST = withApiError(async function POST(req: Request) {
  const body = BodySchema.parse(await req.json());
  await revokeMobileSession(body.refreshToken);
  return ok({ success: true });
}, 'Failed to revoke mobile session');
