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
      if (!(key in process.env)) (process.env as any)[key] = val;
    }
  } catch {
    // ignore missing .env
  }
}

async function main() {
  loadDotEnv(process.cwd());
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Create .env at the repo root first.');
    process.exit(1);
  }

  const [, , userId, amountArg, ...commentParts] = process.argv;
  if (!userId || !amountArg) {
    console.error('Usage: npx tsx scripts/manage-tokens.ts <userId> <amount> [comment...]');
    process.exit(1);
  }

  const amount = Number(amountArg);
  if (!Number.isFinite(amount) || amount === 0) {
    console.error('Amount must be a non-zero number (positive to grant, negative to deduct).');
    process.exit(1);
  }

  const comment = commentParts.length > 0 ? commentParts.join(' ') : 'Adjusted by administrator';

  const [{ prisma }, tokensModule, tokenConstants] = await Promise.all([
    import('../src/server/db'),
    import('../src/server/tokens'),
    import('../src/shared/constants/token-costs'),
  ]);

  const { grantTokens, spendTokens, makeSystemInitiator, InsufficientTokensError, getTokenSummary } = tokensModule;
  const { TOKEN_TRANSACTION_TYPES } = tokenConstants;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, tokenBalance: true } });
  if (!user) {
    console.error('User not found.');
    await prisma.$disconnect();
    process.exit(1);
  }

  const initiator = makeSystemInitiator('admin-cli');

  try {
    if (amount > 0) {
      await grantTokens({
        userId,
        amount: Math.trunc(amount),
        type: TOKEN_TRANSACTION_TYPES.adminAdjustment,
        description: comment,
        initiator,
      });
    } else {
      await spendTokens({
        userId,
        amount: Math.trunc(Math.abs(amount)),
        type: TOKEN_TRANSACTION_TYPES.adminAdjustment,
        description: comment,
        initiator,
      });
    }
  } catch (err: any) {
    if (err instanceof InsufficientTokensError) {
      console.error(`Insufficient tokens. Required ${err.details.required}, available ${err.details.balance}.`);
      await prisma.$disconnect();
      process.exit(1);
    }
    console.error('Failed to adjust tokens:', err?.message || String(err));
    await prisma.$disconnect();
    process.exit(1);
  }

  const summary = await getTokenSummary(userId);
  console.log(
    `Success. User ${user.email || user.id} now has ${summary.balance} tokens (${amount > 0 ? '+' : ''}${Math.trunc(amount)}). Comment: ${comment}`,
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    const { prisma } = await import('../src/server/db');
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
