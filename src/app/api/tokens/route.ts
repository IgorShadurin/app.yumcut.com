import { NextRequest } from 'next/server';
import { getAuthSession } from '@/server/auth';
import { ok, unauthorized } from '@/server/http';
import { withApiError } from '@/server/errors';
import { getTokenSummary } from '@/server/tokens';
import { TOKEN_COSTS, MINIMUM_PROJECT_TOKENS } from '@/shared/constants/token-costs';

export const GET = withApiError(async function GET(_req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user || !(session.user as any).id) return unauthorized();
  const userId = (session.user as any).id as string;
  const summary = await getTokenSummary(userId);
  return ok({
    balance: summary.balance,
    perSecondProject: TOKEN_COSTS.perSecondProject,
    minimumProjectTokens: MINIMUM_PROJECT_TOKENS,
    minimumProjectSeconds: TOKEN_COSTS.minimumProjectSeconds,
    actionCosts: TOKEN_COSTS.actions,
    signUpBonus: TOKEN_COSTS.signUpBonus,
  });
}, 'Failed to load token summary');
