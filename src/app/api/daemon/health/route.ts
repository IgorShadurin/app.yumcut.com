import { NextRequest } from 'next/server';
import { ok, forbidden } from '@/server/http';
import { withApiError } from '@/server/errors';
import { assertDaemonAuth } from '@/server/auth';

export const GET = withApiError(async function GET(req: NextRequest) {
  if (!(await assertDaemonAuth(req))) return forbidden('Invalid daemon credentials');
  return ok({
    ok: true,
    time: new Date().toISOString(),
  });
}, 'Failed to verify daemon health');
