#!/usr/bin/env node
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main() {
  const args = process.argv.slice(2);
  const [{ parsePostalMarketingCampaignArgs, POSTAL_MARKETING_CAMPAIGN_USAGE, runPostalMarketingCampaign }, { prisma }] = await Promise.all([
    import('../src/server/emails/marketing-campaign'),
    import('../src/server/db'),
  ]);

  if (args.includes('--help')) {
    console.log(POSTAL_MARKETING_CAMPAIGN_USAGE);
    return;
  }

  try {
    const options = await parsePostalMarketingCampaignArgs(args);
    const result = await runPostalMarketingCampaign(options);
    console.log(JSON.stringify({ ok: result.failed === 0, ...result }, null, 2));
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
});
